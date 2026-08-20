-- Real production outage, caught live: "BULK ROMA TOMATOES" and "Bulk
-- Navel Oranges" both had package_weight_g = 1 (literally 1 gram --
-- almost certainly a stray "1" typed into dev-deals.tsx's "Package
-- weight (g) -- leave blank if genuinely bulk/loose" field for a
-- genuinely loose lb-priced item, rather than leaving it blank).
-- compute_deal_tag_pricing()'s lb/kg/100g branch scaled a real $1.92/lb
-- rate against that 1 g "package", rounding both tag_price AND
-- tag_original_price to $0.00 -- then refresh_recipe_deal_tags()'s own
-- discount_pct calculation, `1 - tag_price / tag_original_price`,
-- divided 0 by 0 and crashed the ENTIRE function for all 32 recipes,
-- not just the one bad row. Fixed the 2 bad rows directly, but the real
-- lesson (same as the empty product_url outage earlier this session):
-- one bad row should never be able to take down every recipe's pricing
-- refresh. Two independent hardenings:
--
-- 1. discount_pct guarded with NULLIF so a genuinely zero
--    tag_original_price (whatever future cause) computes a safe null
--    instead of crashing -- a deal-tag with no percentage shown is a
--    far better failure mode than the whole catalog refusing to
--    refresh.
-- 2. A CHECK constraint requiring package_weight_g to be null or at
--    least 10 g (no real grocery package weighs less) catches this
--    exact mistake at write time going forward, in dev-deals.tsx or any
--    future sync script, rather than letting bad data reach
--    curated_deals silently.

alter table public.curated_deals
  add constraint curated_deals_package_weight_g_sane
  check (package_weight_g is null or package_weight_g >= 10);

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

      for deal in
        select id, item_name, chain_name, image_url, price, original_price, product_url,
               price_unit, package_weight_g, package_weight_g_source, fragment_by_weight,
               quantity_estimated, original_price_source, bundle_count, package_volume_ml
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
            ing->>'quantity', ing->>'unit', ing->>'name',
            deal.bundle_count, deal.package_volume_ml
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
            -- NULLIF guards against a genuinely zero tag_original_price
            -- (whatever the cause) crashing the whole refresh -- see
            -- this migration's own comment.
            'discount_pct', round((1 - tag_price / nullif(tag_original_price, 0)) * 100),
            'quantity_estimated', tag_estimated,
            'original_price_source', deal.original_price_source,
            'price_estimated', tag_price_estimated,
            'fragment_by_weight', deal.fragment_by_weight,
            'package_weight_g', deal.package_weight_g,
            'price_unit', deal.price_unit,
            'deal_item_name', deal.item_name,
            'bundle_count', deal.bundle_count,
            'package_volume_ml', deal.package_volume_ml
          );
          total := total + tag_contribution;
          exit;
        end if;
      end loop;

      if not matched then
        for deal in
          select id, item_name, chain_name, image_url, price, original_price, product_url, keyword_matches,
                 price_unit, package_weight_g, package_weight_g_source, fragment_by_weight,
                 quantity_estimated, original_price_source, bundle_count, package_volume_ml
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
              ing->>'quantity', ing->>'unit', ing->>'name',
              deal.bundle_count, deal.package_volume_ml
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
              'discount_pct', round((1 - tag_price / nullif(tag_original_price, 0)) * 100),
              'quantity_estimated', tag_estimated,
              'original_price_source', deal.original_price_source,
              'price_estimated', tag_price_estimated,
              'fragment_by_weight', deal.fragment_by_weight,
              'package_weight_g', deal.package_weight_g,
              'price_unit', deal.price_unit,
              'deal_item_name', deal.item_name,
              'bundle_count', deal.bundle_count,
              'package_volume_ml', deal.package_volume_ml
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
  'Rebuilds deal_tags and price for every recipe from scratch against the current curated_deals table, and used_in_recipe on curated_deals itself. Two full passes per ingredient (exact match, then keyword fallback), BOTH restricted to usage <> ''deals''. discount_pct is guarded with nullif(tag_original_price, 0) (20260820 -- a real outage: a package_weight_g=1 data bug rounded both tag_price and tag_original_price to $0.00, and the unguarded division crashed this function for every recipe, not just the bad row) -- a deal-tag with no percentage is a far better failure mode than the whole refresh refusing to run. Each tag carries: name, deal_item_name, original_price_source, price_estimated, fragment_by_weight, package_weight_g, price_unit, bundle_count, package_volume_ml, and raw_price/raw_original_price. The staple-fallback tier honors an optional per-ingredient price_quantity/price_unit override.';

-- Materialize immediately. Verify via a full before/after
-- recipes.price/calories/protein diff -- only the 2 corrected rows'
-- host recipes should move (if any -- both currently show
-- used_in_recipe=false), everything else should be byte-identical.
select public.refresh_recipe_deal_tags();
