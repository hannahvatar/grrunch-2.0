-- Real bug, caught live (Anabelle: "what do i do when reference price
-- is wrong? E.g. AROY-D COCONUT MILK, 400 ML statcan ref is just
-- 'Milk'" -- while a real, correctly-priced "Coconut milk" reference
-- ($6.90/400ml) already exists in staple_reference_prices).
--
-- Both find_reference_price() and refresh_recipe_deal_tags()'s own
-- staple-fallback tier check statcan_reference_prices, then produce_
-- reference_prices, then staple_reference_prices, and their own doc
-- comments describe this as "most-specific match wins" -- but the
-- actual code only ever checked a LATER tier when an EARLIER tier
-- found ABSOLUTELY NOTHING (`if best_words = 0`/`if best_staple_price
-- is null`). The moment statcan matched ANYTHING at all -- even a
-- weak, generic single-word match like "Milk" against "Coconut Milk"
-- -- produce/staple were never even looked at, no matter how much
-- more specific a match they held. "Most specific wins" was never
-- actually true across tiers, only within the first tier that
-- happened to match anything.
--
-- This is the SAME code shape refresh_recipe_deal_tags() uses for
-- real recipe pricing (not just the dev-deals hint card) -- so this
-- wasn't only misleading Anabelle's review, it could have been quietly
-- picking a worse staple-fallback price for any recipe ingredient that
-- happened to weakly match a generic StatCan term while a better,
-- more specific produce/staple reference sat unused.
--
-- Fix: run all three tiers unconditionally, keep whichever match has
-- the MOST words overall (ties broken by tier order -- statcan first
-- -- via strict `>` comparison, which naturally keeps the first-seen
-- entry on a tie). This is what "most-specific match wins" always
-- claimed to do.
create or replace function public.find_reference_price(p_item_name text)
returns table (source text, matched_name text, result_price numeric, result_unit text)
language plpgsql
as $$
declare
  item_words text[];
  ref_words text[];
  best_words int;
  ref record;
begin
  item_words := public.normalize_words(p_item_name);
  best_words := 0;

  for ref in select ingredient_name, avg_price, unit from public.statcan_reference_prices loop
    ref_words := public.normalize_words(ref.ingredient_name);
    if array_length(ref_words, 1) > 0
       and not (array_length(ref_words, 1) = 1 and ref.ingredient_name ~* '\yfrozen\y')
       and ref_words <@ item_words
       and array_length(ref_words, 1) > best_words
    then
      source := 'statcan';
      matched_name := ref.ingredient_name;
      result_price := ref.avg_price;
      result_unit := ref.unit;
      best_words := array_length(ref_words, 1);
    end if;
  end loop;

  -- No longer gated on best_words = 0 -- always checked, so a more
  -- specific produce match can beat a weaker statcan one.
  for ref in select ingredient_name, avg_price, unit from public.produce_reference_prices loop
    ref_words := public.normalize_words(ref.ingredient_name);
    if array_length(ref_words, 1) > 0
       and not (array_length(ref_words, 1) = 1 and ref.ingredient_name ~* '\yfrozen\y')
       and ref_words <@ item_words
       and array_length(ref_words, 1) > best_words
    then
      source := 'produce';
      matched_name := ref.ingredient_name;
      result_price := ref.avg_price;
      result_unit := ref.unit;
      best_words := array_length(ref_words, 1);
    end if;
  end loop;

  -- Same -- always checked, not gated on the earlier tiers coming up empty.
  for ref in
    select ingredient_name, avg_price, unit
    from public.staple_reference_prices
    where checked_by <> 'ai_estimated'
  loop
    ref_words := public.normalize_words(ref.ingredient_name);
    if array_length(ref_words, 1) > 0
       and not (array_length(ref_words, 1) = 1 and ref.ingredient_name ~* '\yfrozen\y')
       and ref_words <@ item_words
       and array_length(ref_words, 1) > best_words
    then
      source := 'staple';
      matched_name := ref.ingredient_name;
      result_price := ref.avg_price;
      result_unit := ref.unit;
      best_words := array_length(ref_words, 1);
    end if;
  end loop;

  if best_words > 0 then
    return next;
  end if;
  return;
end;
$$;

comment on function public.find_reference_price(text) is
  'Read-only informational lookup for app/app/dev-deals.tsx: given a curated_deals.item_name, finds the best-matching statcan/produce/staple reference price (same word-subset matching convention as refresh_recipe_deal_tags()''s own staple-fallback block, but standalone -- no quantity scaling, since there''s no recipe quantity to scale against here, and no pasta-shape aliasing either). All three tiers are checked unconditionally and the single MOST SPECIFIC (highest word-count) match across all of them wins, ties broken by tier order (statcan -> produce -> staple) -- fixed 20260820, previously stopped at the first tier with ANY match regardless of specificity (e.g. "Milk" beating a real "Coconut milk" entry). Returns zero rows when nothing matches, which is expected/common for branded packaged goods that these reference tables don''t cover at all.';

-- refresh_recipe_deal_tags(): identical fix to its own staple-fallback
-- tier (the "if not matched" block) -- everything else in this
-- function (deal-tag matching passes, pricing delegation) is
-- unchanged from 20260819030000_curated_deals_usage_drop_both.sql.
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

        -- No longer gated on best_staple_price is null -- always
        -- checked, so a more specific produce match can beat a weaker
        -- statcan one (this is the actual bug fix).
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

        -- Same -- always checked, not gated on the earlier tiers.
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
  'Rebuilds deal_tags and price for every recipe from scratch against the current curated_deals table, and used_in_recipe on curated_deals itself. Two full passes per ingredient (exact match, then keyword fallback), BOTH restricted to usage <> ''deals''. The staple-fallback tier (statcan -> produce -> staple) checks all three unconditionally and keeps the single MOST SPECIFIC (highest word-count) match across all of them -- fixed 20260820, previously stopped at the first tier with ANY match regardless of specificity. Each tag carries: name (the RECIPE ingredient''s own name, used for matching/grocery-list logic), deal_item_name (the deal''s real flyer product name, for shopper-facing display), original_price_source, price_estimated, fragment_by_weight, package_weight_g, price_unit, and raw_price/raw_original_price (the deal''s own unscaled price, for the badge display). The staple-fallback tier honors an optional per-ingredient price_quantity/price_unit override.';

-- Materialize immediately -- unlike prior migrations touching this
-- function, this is NOT expected to be a pure no-op: any recipe
-- ingredient that was weakly matched to a generic statcan term while a
-- more specific produce/staple reference existed will now correctly
-- switch to the better match. Verify via a full before/after
-- recipes.price/calories/protein diff -- changes are expected and
-- should represent real accuracy improvements, not regressions.
select public.refresh_recipe_deal_tags();
select public.refresh_recipe_nutrition();
