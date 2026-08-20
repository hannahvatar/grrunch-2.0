-- Anabelle, after the usage-classification chip landed as 3 options
-- (recipes/deals/both): "but there are items that i dont want to be
-- in the recipes" -> confirmed the recipes/deals distinction is real
-- and load-bearing -- then, once it was pointed out that 'both' had
-- become functionally identical to 'recipes' (same recipe-matching
-- eligibility, and Deals-tab visibility is now unconditional
-- regardless of usage -- see 20260819020000_curated_deals_usage_
-- comment_fix.sql): "oh yeah got it both is now redundant". Her own
-- original description was always a clean binary ("recipe only...
-- vs deals only") -- 'both' was my own addition, carried over
-- unnecessarily from Airtable's original 3-value "status" field.
-- Collapsing to 2 values to match.
--
-- 3 rows currently sit at 'both' -- folded into 'recipes', the value
-- 'both' was always equivalent to for actual matching behavior. No
-- other row is affected (24 'recipes', 4 'deals' rows are untouched).
update public.curated_deals set usage = 'recipes' where usage = 'both';

alter table public.curated_deals drop constraint curated_deals_usage_check;
alter table public.curated_deals add constraint curated_deals_usage_check check (usage in ('recipes', 'deals'));
alter table public.curated_deals alter column usage set default 'recipes';

comment on column public.curated_deals.usage is
  'Anabelle''s own recipes/deals classification for whether this deal is eligible to price/tag a recipe ingredient (refresh_recipe_deal_tags() -- ''deals'' rows are excluded there) -- straight from Airtable''s "status" field at sync time (see scripts/sync_weekly_deals.py, which folds Airtable''s legacy "both" value into ''recipes'' at sync time -- Airtable''s own field still has 3 options, only Supabase''s is simplified), freely re-correctable afterward in dev-deals.tsx. This is NOT a Weekly-Deals-tab visibility control -- every approved deal shows on that tab (app/lib/curatedDeals.ts''s fetchAllDeals()) regardless of usage; ''deals'' simply means "dont use this to price a recipe," not "hide this from browsing."';

-- refresh_recipe_deal_tags() itself only needs `usage <> 'deals'`
-- instead of `usage in ('recipes', 'both')' now -- functionally
-- identical to before for every existing row (verified via a full
-- before/after recipes.price/calories/protein diff), just no longer
-- naming a value that can't occur anymore.
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
      -- completion, before any keyword is ever considered.
      for deal in
        select id, item_name, chain_name, image_url, price, original_price, product_url,
               price_unit, package_weight_g, package_weight_g_source, fragment_by_weight,
               quantity_estimated, original_price_source
        from public.curated_deals
        where status = 'approved' and usage <> 'deals'
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
          where status = 'approved' and usage <> 'deals'
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
  'Rebuilds deal_tags and price for every recipe from scratch against the current curated_deals table, and used_in_recipe on curated_deals itself. Two full passes per ingredient (exact match, then keyword fallback), BOTH restricted to usage <> ''deals'' -- a ''deals''-classified row (Anabelle''s own recipes/deals call, made in dev-deals.tsx) is never eligible to price or tag a recipe, even if its name would otherwise match. Each tag carries: name (the RECIPE ingredient''s own name, used for matching/grocery-list logic), deal_item_name (the deal''s real flyer product name, for shopper-facing display), original_price_source, price_estimated, fragment_by_weight, package_weight_g, price_unit, and raw_price/raw_original_price (the deal''s own unscaled price, for the badge display). The staple-fallback tier honors an optional per-ingredient price_quantity/price_unit override.';

select public.refresh_recipe_deal_tags();
