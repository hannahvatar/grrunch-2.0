-- Real regression, self-caught: 20260817050000 (raw_price/raw_original_price
-- badge fix) was authored by copying this function's body from an
-- OLDER read (20260817010000, taken before 20260817020000's
-- price_quantity/price_unit override had landed) instead of the
-- actual current database state -- silently dropped the
-- coalesce(ing->>'price_quantity', ing->>'quantity') /
-- coalesce(ing->>'price_unit', ing->>'unit') in the staple-fallback
-- tier's scale_reference_price call, reverting to the plain
-- ing->>'quantity'/ing->>'unit'.
--
-- Caught live: Black beans (Jamaican Patty) was given quantity="1",
-- unit="can (540 mL)" for honest display, with price_quantity="300"/
-- price_unit="g" to keep pricing/nutrition on the real 300 g drained
-- weight (matching the "Black beans" staple_reference_prices row,
-- itself denominated in grams). With the override silently dropped,
-- scale_reference_price got the raw "can (540 mL)" text instead of
-- "300"/"g" -- the parenthetical hint parses to 540 mL (base_unit
-- 'ml'), which doesn't match the reference row's 'g' base_unit and no
-- density bridge exists for "black beans", so scale_reference_price
-- returned null and the ingredient silently contributed $0 -- the
-- recipe's price dropped from $2.92 back to $2.72, the exact black
-- bean contribution, with no error anywhere.
--
-- Fixed by restoring the coalesce exactly as it was in
-- 20260817020000_staple_price_quantity_override.sql. No other change
-- in this migration -- raw_price/raw_original_price and the Pass-2
-- price_unit fix from 20260817050000 are both kept as-is.
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

      -- Pass 1: exact match only, across EVERY approved deal, to
      -- completion, before any keyword is ever considered. This
      -- ordering is load-bearing -- see 20260808041000 for why.
      for deal in
        select id, item_name, chain_name, image_url, price, original_price, product_url,
               price_unit, package_weight_g, package_weight_g_source, fragment_by_weight,
               quantity_estimated, original_price_source
        from public.curated_deals
        where status = 'approved'
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
            -- No computable price (a bulk-rate deal whose matched
            -- recipe ingredient has no parseable weight) -- leave
            -- unmatched so this ingredient falls through to the
            -- staple-reference fallback below instead of tagging a
            -- deal with no real price.
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
            'price_unit', deal.price_unit
          );
          total := total + tag_contribution;
          exit;
        end if;
      end loop;

      -- Pass 2: keyword fallback -- only runs if pass 1 found nothing
      -- for this ingredient anywhere.
      if not matched then
        for deal in
          select id, item_name, chain_name, image_url, price, original_price, product_url, keyword_matches,
                 price_unit, package_weight_g, package_weight_g_source, fragment_by_weight,
                 quantity_estimated, original_price_source
          from public.curated_deals
          where status = 'approved' and keyword_matches is not null and array_length(keyword_matches, 1) > 0
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
              'price_unit', deal.price_unit
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
        -- Aliased only for the staple-reference-price fallback below --
        -- deal matching above stays literal (see 20260801080000).
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
          -- Restored: price_quantity/price_unit override, coalesced
          -- with the ingredient's real quantity/unit when absent (see
          -- 20260817020000_staple_price_quantity_override.sql).
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
  'Rebuilds deal_tags and price for every recipe from scratch against the current curated_deals table, and used_in_recipe on curated_deals itself. Two full passes per ingredient (exact match, then keyword fallback) -- see compute_deal_tag_pricing() for the pricing/package_count logic. Each tag also carries original_price_source, price_estimated, fragment_by_weight, package_weight_g, and price_unit (both passes). raw_price/raw_original_price (20260817050000) carry the deal''s own UNSCALED curated_deals.price/original_price alongside the computed price/original_price -- the client uses raw_price for the "On Sale This Week" badge display so it always visually matches the flyer''s own printed rate, while price/tag_contribution (what the recipe total actually charges) keeps scaling by real quantity used. The staple-fallback tier honors an optional per-ingredient price_quantity/price_unit override, coalesced with quantity/unit when absent (20260817020000; restored here after 20260817050000 accidentally dropped it -- see that migration''s comment) -- lets a staple''s DISPLAY quantity/unit (e.g. "1 can (540 mL)") diverge from what pricing actually scales against (e.g. "300 g" drained weight).';

select public.refresh_recipe_deal_tags();
