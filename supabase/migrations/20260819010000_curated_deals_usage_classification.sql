-- Anabelle: "why do I approve deals twice: in Airtable and in the page
-- dev-deals" -- the two-stage review (Airtable Select=Approved, then a
-- separate dev-deals.tsx pricing pass) is being collapsed into one:
-- everything AI-classified and not chain-excluded now reaches Supabase
-- as 'pending', and dev-deals.tsx becomes the single place she reviews,
-- corrects, approves, or rejects a deal -- see
-- scripts/sync_weekly_deals.py's sync_curated_deals() for the sync-side
-- half of this change.
--
-- Airtable's "status" field (recipes/deals/both -- an AI zone-review
-- agent's classification of what a candidate is good for) used to be
-- ONLY a pre-sync eligibility gate: once a row reached curated_deals,
-- nothing downstream ever looked at it again -- every synced deal was
-- equally eligible for both recipe ingredient matching (deal_tags) AND
-- the general Deals tab, regardless of what Airtable said. That's
-- almost certainly not what "recipes/deals/both" was meant to mean --
-- a "deals"-only item (a fine markdown, but a bad recipe-cost anchor,
-- e.g. a bulk multi-buy or an odd cut) shouldn't silently start
-- pricing a recipe just because nothing stopped it.
--
-- This migration:
--   1. Adds curated_deals.usage (recipes/deals/both), backfilled 'both'
--      for every existing row -- 'both' is the ONLY backfill value that
--      keeps every existing row's behavior byte-for-byte identical
--      (every row was already effectively eligible for both surfaces
--      before this column existed), so this migration is a true no-op
--      for every recipe's price/nutrition on the day it lands --
--      verified via a full before/after recipes.price/calories/protein
--      diff.
--   2. Makes refresh_recipe_deal_tags() usage-aware: a 'deals'-only row
--      can no longer match onto a recipe (both matching passes now
--      require usage in ('recipes', 'both')). This is the only
--      direction that needed restricting -- deal_tags matching was the
--      one place "usage" had zero effect before. The Deals-tab side
--      (excluding a 'recipes'-only row from the general browse list) is
--      a client-side change in app/lib/curatedDeals.ts's fetchAllDeals(),
--      not a DB-side one -- fetchDealsByIds() (grocery-list deal lookup
--      by id, for items already tied to a recipe) must NOT apply this
--      filter, since a recipe-linked grocery item needs its deal info
--      regardless of whether that same deal would also show on the
--      general Deals tab.
--
-- usage is a plain text + check constraint, not a new enum type --
-- same reasoning as original_price_source
-- (20260812000000_curated_deals_original_price_source.sql): a 3-value
-- classification like this is exactly the kind of thing that gains a
-- 4th option someday, and altering a check constraint is a one-line
-- migration where altering an enum type is a multi-step dance in
-- Postgres.
alter table public.curated_deals
  add column usage text not null default 'both'
    check (usage in ('recipes', 'deals', 'both'));

comment on column public.curated_deals.usage is
  'Anabelle''s own recipes/deals/both classification for what this deal is good for -- straight from Airtable''s "status" field at sync time (see scripts/sync_weekly_deals.py), freely re-correctable afterward in dev-deals.tsx. ''recipes'' means this deal should be eligible to price/tag recipe ingredients (refresh_recipe_deal_tags()) but not clutter the general Deals tab; ''deals'' means the opposite (a fine markdown, but not a good recipe-cost anchor -- excluded from both matching passes below); ''both'' (the default, and the backfill value for every pre-existing row, so this column is a true no-op for every row synced before it existed) is eligible for everything, same as every row behaved before this column existed.';

-- Both matching passes gain `and usage in ('recipes', 'both')' --
-- everything else about the function (word-subset matching, keyword
-- fallback, pricing delegation to compute_deal_tag_pricing()) is
-- unchanged. This is the ONLY functional change in this migration.
create or replace function public.refresh_recipe_deal_tags()
returns void
language plpgsql
as $$
declare
  rec record;
  ing jsonb;
  deal record;
  staple record;
  new_tags jsonb;
  ing_words text[];
  alias_ing_words text[];
  deal_words text[];
  keyword text;
  keyword_words text[];
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

      -- Pass 1: exact match only, across EVERY eligible deal, to
      -- completion, before any keyword is ever considered. usage in
      -- ('recipes', 'both') excludes a 'deals'-only row from ever
      -- pricing/tagging a recipe -- see this migration's header comment.
      for deal in
        select id, item_name, chain_name, image_url, price, original_price, product_url,
               price_unit, package_weight_g, package_weight_g_source, fragment_by_weight,
               quantity_estimated, original_price_source
        from public.curated_deals
        where status = 'approved' and usage in ('recipes', 'both')
      loop
        deal_words := public.normalize_words(deal.item_name);
        if array_length(deal_words, 1) > 0 and deal_words <@ ing_words then
          select p.tag_price, p.tag_original_price, p.tag_quantity_estimated, p.tag_price_estimated, p.tag_contribution
            into tag_price, tag_original_price, tag_estimated, tag_price_estimated, tag_contribution
          from public.compute_deal_tag_pricing(
            deal.price, deal.original_price, deal.price_unit, deal.package_weight_g,
            deal.package_weight_g_source, deal.fragment_by_weight, deal.quantity_estimated,
            ing->>'quantity', ing->>'unit', ing->>'name'
          ) p;

          if tag_price is null then
            continue;
          end if;

          matched := true;
          matched_deal_ids := array_append(matched_deal_ids, deal.id);
          new_tags := new_tags || jsonb_build_object(
            'name', ing->>'name',
            'store', deal.chain_name,
            'image_url', deal.image_url,
            'product_url', deal.product_url,
            'price', tag_price,
            'original_price', tag_original_price,
            'raw_price', deal.price,
            'raw_original_price', deal.original_price,
            'discount_pct', round((1 - tag_price / tag_original_price) * 100),
            'quantity_estimated', tag_estimated,
            'original_price_source', deal.original_price_source,
            'price_estimated', tag_price_estimated,
            'fragment_by_weight', deal.fragment_by_weight,
            'package_weight_g', deal.package_weight_g,
            'price_unit', deal.price_unit,
            'deal_item_name', deal.item_name
          );
          total := total + tag_contribution;
          exit;
        end if;
      end loop;

      -- Pass 2: keyword fallback -- only runs if pass 1 found nothing
      -- for this ingredient anywhere. Same usage restriction.
      if not matched then
        for deal in
          select id, item_name, chain_name, image_url, price, original_price, product_url, keyword_matches,
                 price_unit, package_weight_g, package_weight_g_source, fragment_by_weight,
                 quantity_estimated, original_price_source
          from public.curated_deals
          where status = 'approved' and usage in ('recipes', 'both')
            and keyword_matches is not null and array_length(keyword_matches, 1) > 0
        loop
          matched := false;
          foreach keyword in array deal.keyword_matches loop
            keyword_words := public.normalize_words(keyword);
            if public.words_loosely_subset(keyword_words, ing_words) then
              matched := true;
              exit;
            end if;
          end loop;

          if matched then
            select p.tag_price, p.tag_original_price, p.tag_quantity_estimated, p.tag_price_estimated, p.tag_contribution
              into tag_price, tag_original_price, tag_estimated, tag_price_estimated, tag_contribution
            from public.compute_deal_tag_pricing(
              deal.price, deal.original_price, deal.price_unit, deal.package_weight_g,
              deal.package_weight_g_source, deal.fragment_by_weight, deal.quantity_estimated,
              ing->>'quantity', ing->>'unit', ing->>'name'
            ) p;

            if tag_price is null then
              matched := false;
              continue;
            end if;

            matched_deal_ids := array_append(matched_deal_ids, deal.id);
            new_tags := new_tags || jsonb_build_object(
              'name', ing->>'name',
              'store', deal.chain_name,
              'image_url', deal.image_url,
              'product_url', deal.product_url,
              'price', tag_price,
              'original_price', tag_original_price,
              'raw_price', deal.price,
              'raw_original_price', deal.original_price,
              'discount_pct', round((1 - tag_price / tag_original_price) * 100),
              'quantity_estimated', tag_estimated,
              'original_price_source', deal.original_price_source,
              'price_estimated', tag_price_estimated,
              'fragment_by_weight', deal.fragment_by_weight,
              'package_weight_g', deal.package_weight_g,
              'price_unit', deal.price_unit,
              'deal_item_name', deal.item_name
            );
            total := total + tag_contribution;
            exit;
          end if;
        end loop;
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

        if best_staple_price is null then
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
        end if;

        if best_staple_price is null then
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
        end if;

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
  'Rebuilds deal_tags and price for every recipe from scratch against the current curated_deals table, and used_in_recipe on curated_deals itself. Two full passes per ingredient (exact match, then keyword fallback), BOTH restricted to usage in (''recipes'', ''both'') -- a ''deals''-only classified row (Anabelle''s own recipes/deals/both call, made in dev-deals.tsx) is never eligible to price or tag a recipe, even if its name would otherwise match. Each tag carries: name (the RECIPE ingredient''s own name, used for matching/grocery-list logic), deal_item_name (the deal''s real flyer product name, for shopper-facing display), original_price_source, price_estimated, fragment_by_weight, package_weight_g, price_unit, and raw_price/raw_original_price (the deal''s own unscaled price, for the badge display). The staple-fallback tier honors an optional per-ingredient price_quantity/price_unit override.';

-- Materialize immediately -- see this migration's header for why this
-- is expected to be a true no-op on the day it lands (every existing
-- row backfills usage='both', identical eligibility to before this
-- column existed). refresh_recipe_nutrition() is NOT re-run here --
-- its "deal-tagged items" tier matches against
-- deal_item_nutrition_reference by item_name directly, entirely
-- independent of curated_deals.status/usage or deal_tags -- this
-- change cannot affect it.
select public.refresh_recipe_deal_tags();
