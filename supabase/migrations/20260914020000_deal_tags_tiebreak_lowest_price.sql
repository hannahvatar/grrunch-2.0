-- Real, already-flagged gap (20260822000000_deal_matching_most_specific
-- _wins.sql's own comment: "the same underlying class of non-determinism
-- already flagged separately") -- confirmed while investigating whether
-- recipe pricing should be zone-aware (Anabelle, 2026-09-14). It isn't
-- (recipes.price/deal_tags is one global value shown to every user,
-- computed by this function; making it genuinely per-user/zone-aware is
-- a real architecture change, deliberately NOT what this migration does
-- -- see the conversation this was scoped from). But investigating that
-- surfaced a real bug worth fixing regardless of zone: when two
-- curated_deals rows tie on specificity (equal word-count match against
-- an ingredient -- e.g. two different chains, or now two different
-- zones of the SAME chain, both selling "Green Onions" with no more-
-- specific name on either side), the "most specific wins" rule from
-- that migration has nothing left to decide with, and silently falls
-- back to raw table scan order -- undefined, and liable to change on
-- any future curated_deals write/vacuum, not tied to anything a shopper
-- would recognize as a reason.
--
-- Fix: on a genuine tie (equal word count), prefer the LOWER price
-- instead of leaving it to scan order. Deterministic, and a defensible
-- default on its own merits (this app's whole value proposition is
-- deal-driven pricing, so "when two deals match equally well, show the
-- cheaper one" needs no zone/chain-preference table to justify) --
-- unlike preferring a specific zone by name, this doesn't require
-- hardcoding any zone knowledge into SQL, so it works the same whether
-- the tie came from two chains or two zones of one chain.
--
-- Pure logic change scoped to the two curated_deals matching tiers
-- (exact-match, keyword-fallback) -- the staple/reference fallback
-- tier (statcan/produce/staple) is untouched, has no chain/zone concept
-- at all, and keeps its own existing tier_rank-then-word-count
-- tie-break unchanged. Everything else in this function (temp-table
-- precompute, staple tier, pricing computation, output shape) is
-- copied byte-for-byte from 20260826010000_deal_tags_refresh_
-- precompute_words.sql.
create or replace function public.refresh_recipe_deal_tags()
returns void
language plpgsql
as $$
declare
  rec record;
  ing jsonb;
  deal record;
  best_deal record;
  best_deal_words int;
  staple record;
  new_tags jsonb;
  ing_words text[];
  alias_ing_words text[];
  keyword text;
  keyword_words text[];
  best_keyword_words int;
  matched boolean;
  total numeric;
  best_staple_price numeric;
  best_staple_unit text;
  best_staple_words int;
  scaled numeric;
  tag_price numeric;
  tag_original_price numeric;
  tag_estimated boolean;
  tag_price_estimated boolean;
  tag_contribution numeric;
  matched_deal_ids uuid[] := '{}';
begin
  drop table if exists deal_cache;
  drop table if exists staple_cache;

  create temp table deal_cache on commit drop as
  select id, item_name, chain_name, image_url, price, original_price, product_url,
         price_unit, package_weight_g, package_weight_g_source, fragment_by_weight,
         quantity_estimated, original_price_source, bundle_count, package_volume_ml,
         keyword_matches,
         public.normalize_words(item_name) as deal_words
  from public.curated_deals
  where status = 'approved' and usage <> 'deals';

  create temp table staple_cache on commit drop as
  select 1 as tier_rank, ingredient_name, avg_price, unit,
         public.staple_alias_words(public.normalize_words(ingredient_name)) as staple_words
  from public.statcan_reference_prices
  union all
  select 2 as tier_rank, ingredient_name, avg_price, unit,
         public.staple_alias_words(public.normalize_words(ingredient_name)) as staple_words
  from public.produce_reference_prices
  union all
  select 3 as tier_rank, ingredient_name, avg_price, unit,
         public.staple_alias_words(public.normalize_words(ingredient_name)) as staple_words
  from public.staple_reference_prices
  where checked_by <> 'ai_estimated';

  update public.curated_deals set used_in_recipe = false where used_in_recipe = true;

  for rec in select id, ingredients, servings from public.recipes loop
    new_tags := '[]'::jsonb;
    total := 0;

    for ing in select value from jsonb_array_elements(rec.ingredients) loop
      ing_words := public.normalize_words(ing->>'name');
      matched := false;
      best_deal_words := 0;

      for deal in select * from deal_cache loop
        if array_length(deal.deal_words, 1) > 0 and deal.deal_words <@ ing_words then
          if array_length(deal.deal_words, 1) > best_deal_words then
            best_deal := deal;
            best_deal_words := array_length(deal.deal_words, 1);
          -- Tie-break: equal specificity, lower price wins (see this
          -- migration's own header comment). A genuine elsif branch,
          -- not folded into the if-condition above as `or (...)` --
          -- PL/pgSQL throws "record is not assigned yet" on ANY field
          -- access of an unassigned record even inside an OR expression
          -- Postgres won't short-circuit around at the expression level
          -- (a real gotcha, caught live on this migration's first two
          -- db push attempts). A true elsif IS safe: it's a separate
          -- control-flow branch plpgsql only even evaluates once the
          -- `if` above has already run and found false, by which point
          -- best_deal_words > 0 (checked next) guarantees best_deal was
          -- assigned on a prior iteration.
          elsif best_deal_words > 0 and array_length(deal.deal_words, 1) = best_deal_words and deal.price < best_deal.price then
            best_deal := deal;
          end if;
        end if;
      end loop;

      if best_deal_words > 0 then
        select p.tag_price, p.tag_original_price, p.tag_quantity_estimated, p.tag_price_estimated, p.tag_contribution
          into tag_price, tag_original_price, tag_estimated, tag_price_estimated, tag_contribution
        from public.compute_deal_tag_pricing(
          best_deal.price, best_deal.original_price, best_deal.price_unit, best_deal.package_weight_g,
          best_deal.package_weight_g_source, best_deal.fragment_by_weight, best_deal.quantity_estimated,
          ing->>'quantity', ing->>'unit', ing->>'name',
          best_deal.bundle_count, best_deal.package_volume_ml
        ) p;

        if tag_price is not null then
          matched := true;
          matched_deal_ids := array_append(matched_deal_ids, best_deal.id);
          new_tags := new_tags || jsonb_build_object(
            'name', ing->>'name',
            'store', best_deal.chain_name,
            'image_url', best_deal.image_url,
            'product_url', best_deal.product_url,
            'price', tag_price,
            'original_price', tag_original_price,
            'raw_price', best_deal.price,
            'raw_original_price', best_deal.original_price,
            -- NULLIF guards against a genuinely zero tag_original_price
            -- (whatever the cause) crashing the whole refresh -- see
            -- 20260820030000_guard_discount_pct_division.sql.
            'discount_pct', round((1 - tag_price / nullif(tag_original_price, 0)) * 100),
            'quantity_estimated', tag_estimated,
            'original_price_source', best_deal.original_price_source,
            'price_estimated', tag_price_estimated,
            'fragment_by_weight', best_deal.fragment_by_weight,
            'package_weight_g', best_deal.package_weight_g,
            'price_unit', best_deal.price_unit,
            'deal_item_name', best_deal.item_name,
            'bundle_count', best_deal.bundle_count,
            'package_volume_ml', best_deal.package_volume_ml
          );
          total := total + tag_contribution;
        end if;
      end if;

      if not matched then
        best_deal_words := 0;
        best_keyword_words := 0;

        for deal in
          select * from deal_cache
          where keyword_matches is not null and array_length(keyword_matches, 1) > 0
        loop
          foreach keyword in array deal.keyword_matches loop
            keyword_words := public.normalize_words(keyword);
            if array_length(keyword_words, 1) > 0
               and public.words_loosely_subset(keyword_words, ing_words)
            then
              if array_length(keyword_words, 1) > best_keyword_words then
                best_deal := deal;
                best_keyword_words := array_length(keyword_words, 1);
              -- Same tie-break, and same genuine-elsif requirement, as
              -- the exact-match tier above.
              elsif best_keyword_words > 0 and array_length(keyword_words, 1) = best_keyword_words and deal.price < best_deal.price then
                best_deal := deal;
              end if;
            end if;
          end loop;
        end loop;

        if best_keyword_words > 0 then
          select p.tag_price, p.tag_original_price, p.tag_quantity_estimated, p.tag_price_estimated, p.tag_contribution
            into tag_price, tag_original_price, tag_estimated, tag_price_estimated, tag_contribution
          from public.compute_deal_tag_pricing(
            best_deal.price, best_deal.original_price, best_deal.price_unit, best_deal.package_weight_g,
            best_deal.package_weight_g_source, best_deal.fragment_by_weight, best_deal.quantity_estimated,
            ing->>'quantity', ing->>'unit', ing->>'name',
            best_deal.bundle_count, best_deal.package_volume_ml
          ) p;

          if tag_price is not null then
            matched := true;
            matched_deal_ids := array_append(matched_deal_ids, best_deal.id);
            new_tags := new_tags || jsonb_build_object(
              'name', ing->>'name',
              'store', best_deal.chain_name,
              'image_url', best_deal.image_url,
              'product_url', best_deal.product_url,
              'price', tag_price,
              'original_price', tag_original_price,
              'raw_price', best_deal.price,
              'raw_original_price', best_deal.original_price,
              'discount_pct', round((1 - tag_price / nullif(tag_original_price, 0)) * 100),
              'quantity_estimated', tag_estimated,
              'original_price_source', best_deal.original_price_source,
              'price_estimated', tag_price_estimated,
              'fragment_by_weight', best_deal.fragment_by_weight,
              'package_weight_g', best_deal.package_weight_g,
              'price_unit', best_deal.price_unit,
              'deal_item_name', best_deal.item_name,
              'bundle_count', best_deal.bundle_count,
              'package_volume_ml', best_deal.package_volume_ml
            );
            total := total + tag_contribution;
          end if;
        end if;
      end if;

      if not matched then
        best_staple_price := null;
        best_staple_unit := null;
        best_staple_words := 0;
        alias_ing_words := public.staple_alias_words(ing_words);

        for staple in select * from staple_cache order by tier_rank loop
          if array_length(staple.staple_words, 1) > 0
             and not (array_length(staple.staple_words, 1) = 1 and staple.ingredient_name ~* '\yfrozen\y')
             and staple.staple_words <@ alias_ing_words
             and array_length(staple.staple_words, 1) > best_staple_words
          then
            best_staple_price := staple.avg_price;
            best_staple_unit := staple.unit;
            best_staple_words := array_length(staple.staple_words, 1);
          end if;
        end loop;

        if best_staple_price is not null then
          scaled := public.scale_reference_price(
            coalesce(ing->>'price_quantity', ing->>'quantity'),
            coalesce(ing->>'price_unit', ing->>'unit'),
            ing->>'name',
            best_staple_price, best_staple_unit
          );
          if scaled is not null then
            total := total + scaled;
          end if;
        end if;
      end if;
    end loop;

    update public.recipes
      set deal_tags = new_tags,
          price = case when rec.servings > 0 then round(total / rec.servings, 2) else round(total, 2) end
      where id = rec.id;
  end loop;

  if array_length(matched_deal_ids, 1) > 0 then
    update public.curated_deals set used_in_recipe = true where id = any(matched_deal_ids);
  end if;
end;
$$;

comment on function public.refresh_recipe_deal_tags() is
  'Rebuilds deal_tags and price for every recipe from scratch against the current curated_deals table, and used_in_recipe on curated_deals itself. Precomputes normalize_words()/staple_alias_words() once per deal/reference row into temp tables (deal_cache, staple_cache) before the recipe loop (20260826 perf fix). Two full passes per ingredient (exact match, then keyword fallback), BOTH restricted to usage <> ''deals'', and BOTH keep the single MOST SPECIFIC (highest word-count) candidate across the whole scan before pricing it -- ON A TIE (equal word count), the LOWER-PRICED candidate wins (20260914, fixing a real non-determinism gap: two curated_deals rows matching an ingredient equally well -- different chains, or different zones of the same chain -- used to fall back to undefined scan order). The staple-fallback tier (statcan/produce/staple) is unrelated to chain/zone and keeps its own tier_rank-then-word-count tie-break, unchanged. Each tag carries: name, deal_item_name, original_price_source, price_estimated, fragment_by_weight, package_weight_g, price_unit, bundle_count, package_volume_ml, and raw_price/raw_original_price. The staple-fallback tier honors an optional per-ingredient price_quantity/price_unit override. NOT zone-aware in the sense of computing a per-user price -- deal_tags/price stay one shared value for every user regardless of their selected stores (a genuinely per-user/zone-aware price would be a real architecture change, deliberately out of scope here).';

select public.refresh_recipe_deal_tags();
