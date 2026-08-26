-- Real bug, caught live: "Beefsteak Tomatoes" (Classic Ground Beef
-- Tacos) and "Cherry tomatoes" (TikTok Baked Feta Pasta) were both
-- matching "TOMATOES, 796 mL" -- a canned, generic deal -- instead of
-- their own correct fresh-produce match. Anabelle: "remove package
-- tomatoes, 796 ml. Use fresh tomatoes instead."
--
-- Root cause: the exact-match and keyword-match tiers of
-- refresh_recipe_deal_tags() take the FIRST candidate deal an
-- unordered table scan happens to return and `exit` immediately --
-- unlike the staple-fallback tier three steps below, which already
-- tracks the MOST SPECIFIC match (highest word count) across every
-- candidate before committing to one. "TOMATOES, 796 mL" (one real
-- word: "tomatoes") and "BEEFSTEAK TOMATOES" (two: "beefsteak",
-- "tomatoes") are BOTH valid word-subset matches for an ingredient
-- named "Beefsteak Tomatoes" -- with no specificity preference, which
-- one wins is pure Postgres scan-order luck, the same underlying class
-- of non-determinism already flagged separately (spawned as a
-- background task) for ties between two candidates of EQUAL
-- specificity (e.g. two different stores both selling "Green Onions").
-- This is the sharper, more clearly-defined half of that same gap:
-- even with a stable scan order, there was never any logic preferring
-- the more specific name at all.
--
-- Fix: both tiers now scan every candidate and keep the one with the
-- most matched words (ties still fall to scan order, same open
-- question the background task covers), mirroring the staple tier's
-- existing best_word_count pattern exactly. Pricing is computed once,
-- for the winner only, after each tier's scan completes.
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
  deal_words text[];
  keyword text;
  keyword_words text[];
  best_keyword_words int;
  staple_words text[];
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
  update public.curated_deals set used_in_recipe = false where used_in_recipe = true;

  for rec in select id, ingredients, servings from public.recipes loop
    new_tags := '[]'::jsonb;
    total := 0;

    for ing in select value from jsonb_array_elements(rec.ingredients) loop
      ing_words := public.normalize_words(ing->>'name');
      matched := false;
      best_deal_words := 0;

      for deal in
        select id, item_name, chain_name, image_url, price, original_price, product_url,
               price_unit, package_weight_g, package_weight_g_source, fragment_by_weight,
               quantity_estimated, original_price_source, bundle_count, package_volume_ml
        from public.curated_deals
        where status = 'approved' and usage <> 'deals'
      loop
        deal_words := public.normalize_words(deal.item_name);
        if array_length(deal_words, 1) > 0 and deal_words <@ ing_words
           and array_length(deal_words, 1) > best_deal_words
        then
          best_deal := deal;
          best_deal_words := array_length(deal_words, 1);
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
          select id, item_name, chain_name, image_url, price, original_price, product_url, keyword_matches,
                 price_unit, package_weight_g, package_weight_g_source, fragment_by_weight,
                 quantity_estimated, original_price_source, bundle_count, package_volume_ml
          from public.curated_deals
          where status = 'approved' and usage <> 'deals'
            and keyword_matches is not null and array_length(keyword_matches, 1) > 0
        loop
          foreach keyword in array deal.keyword_matches loop
            keyword_words := public.normalize_words(keyword);
            if array_length(keyword_words, 1) > 0
               and public.words_loosely_subset(keyword_words, ing_words)
               and array_length(keyword_words, 1) > best_keyword_words
            then
              best_deal := deal;
              best_keyword_words := array_length(keyword_words, 1);
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

        for staple in
          select ingredient_name, avg_price, unit from public.statcan_reference_prices
        loop
          staple_words := public.staple_alias_words(public.normalize_words(staple.ingredient_name));
          if array_length(staple_words, 1) > 0
             and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\yfrozen\y')
             and staple_words <@ alias_ing_words
             and array_length(staple_words, 1) > best_staple_words
          then
            best_staple_price := staple.avg_price;
            best_staple_unit := staple.unit;
            best_staple_words := array_length(staple_words, 1);
          end if;
        end loop;

        for staple in
          select ingredient_name, avg_price, unit from public.produce_reference_prices
        loop
          staple_words := public.staple_alias_words(public.normalize_words(staple.ingredient_name));
          if array_length(staple_words, 1) > 0
             and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\yfrozen\y')
             and staple_words <@ alias_ing_words
             and array_length(staple_words, 1) > best_staple_words
          then
            best_staple_price := staple.avg_price;
            best_staple_unit := staple.unit;
            best_staple_words := array_length(staple_words, 1);
          end if;
        end loop;

        for staple in
          select ingredient_name, avg_price, unit
          from public.staple_reference_prices
          where checked_by <> 'ai_estimated'
        loop
          staple_words := public.staple_alias_words(public.normalize_words(staple.ingredient_name));
          if array_length(staple_words, 1) > 0
             and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\yfrozen\y')
             and staple_words <@ alias_ing_words
             and array_length(staple_words, 1) > best_staple_words
          then
            best_staple_price := staple.avg_price;
            best_staple_unit := staple.unit;
            best_staple_words := array_length(staple_words, 1);
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
  'Rebuilds deal_tags and price for every recipe from scratch against the current curated_deals table, and used_in_recipe on curated_deals itself. Two full passes per ingredient (exact match, then keyword fallback), BOTH restricted to usage <> ''deals'', and BOTH now keep the single MOST SPECIFIC (highest word-count) candidate across the whole scan before pricing it -- same specificity-preference the staple-fallback tier (statcan -> produce -> staple) already had, extended here so a generic deal name can never beat a more specific one just by scan-order luck (20260822 -- e.g. "TOMATOES, 796 mL" no longer beats "BEEFSTEAK TOMATOES" for an ingredient naming both words). Each tag carries: name, deal_item_name, original_price_source, price_estimated, fragment_by_weight, package_weight_g, price_unit, bundle_count, package_volume_ml, and raw_price/raw_original_price. The staple-fallback tier honors an optional per-ingredient price_quantity/price_unit override.';

select public.refresh_recipe_deal_tags();
