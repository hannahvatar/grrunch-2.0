-- Phase 2b groundwork: scaleMealToTargets currently only has one lever
-- (serving count) to hit a calorie/protein target, because it only knows
-- each recipe's already-combined totals. To add a second lever --
-- flexing how much of a generic staple (rice, potatoes, oil...) goes into
-- the dish -- it needs those totals split into the portion that CAN
-- flex (staples, matched via staple_reference_prices/statcan_reference_prices)
-- and the portion that CAN'T (deal-tagged anchor items, bought as a whole
-- package and never fragmented -- see docs/grrunch-architecture.md item 12,
-- and refresh_recipe_deal_tags' existing "don't fragment deal items" price
-- handling). Whole-recipe totals at the recipe's original quantities (not
-- per-serving) -- same convention scaleMealToTargets already uses
-- internally (meal.calories * meal.servings).
alter table public.recipes
  add column fixed_price numeric(10, 2) check (fixed_price >= 0),
  add column flexible_price numeric(10, 2) check (flexible_price >= 0),
  add column fixed_calories numeric(10, 2) check (fixed_calories >= 0),
  add column flexible_calories numeric(10, 2) check (flexible_calories >= 0),
  add column fixed_protein numeric(10, 2) check (fixed_protein >= 0),
  add column flexible_protein numeric(10, 2) check (flexible_protein >= 0);

comment on column public.recipes.flexible_calories is
  'Whole-recipe calories from generic staple ingredients at this recipe''s original quantities -- the portion scaleMealToTargets can scale up/down to help hit a calorie/protein target. fixed_calories (deal-tagged anchor items) never changes. calories = round((fixed_calories + flexible_calories) / servings) at baseline (staple multiplier = 1), same as before this split existed.';

-- Same total, now split into the two buckets instead of one running sum.
-- Deal-priced items still add their full package price unscaled (never
-- fragmented); staple-priced items go into the flexible bucket via
-- scale_reference_price, same matching/scaling as before.
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
  deal_words text[];
  staple_words text[];
  matched boolean;
  fixed_total numeric;
  flexible_total numeric;
  best_staple_price numeric;
  best_staple_unit text;
  best_staple_words int;
  scaled numeric;
begin
  for rec in select id, ingredients, servings from public.recipes loop
    new_tags := '[]'::jsonb;
    fixed_total := 0;
    flexible_total := 0;

    for ing in select value from jsonb_array_elements(rec.ingredients) loop
      ing_words := public.normalize_words(ing->>'name');
      matched := false;

      for deal in
        select item_name, chain_name, image_url, price, original_price
        from public.curated_deals
        where status = 'approved'
      loop
        deal_words := public.normalize_words(deal.item_name);

        if array_length(deal_words, 1) > 0 and deal_words <@ ing_words then
          new_tags := new_tags || jsonb_build_object(
            'name', ing->>'name',
            'store', deal.chain_name,
            'image_url', deal.image_url,
            'price', deal.price,
            'original_price', deal.original_price,
            'discount_pct', round((1 - deal.price / deal.original_price) * 100),
            'quantity_estimated', false
          );
          fixed_total := fixed_total + deal.price;
          matched := true;
          exit;
        end if;
      end loop;

      if not matched then
        best_staple_price := null;
        best_staple_unit := null;
        best_staple_words := 0;

        for staple in
          select ingredient_name, avg_price, unit from public.statcan_reference_prices
        loop
          staple_words := public.normalize_words(staple.ingredient_name);
          if array_length(staple_words, 1) > 0
             and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\y(fresh|frozen)\y')
             and staple_words <@ ing_words
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
            staple_words := public.normalize_words(staple.ingredient_name);
            if array_length(staple_words, 1) > 0
               and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\y(fresh|frozen)\y')
               and staple_words <@ ing_words
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
            staple_words := public.normalize_words(staple.ingredient_name);
            if array_length(staple_words, 1) > 0
               and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\y(fresh|frozen)\y')
               and staple_words <@ ing_words
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
            ing->>'quantity', ing->>'unit', ing->>'name',
            best_staple_price, best_staple_unit
          );
          if scaled is not null then
            flexible_total := flexible_total + scaled;
          end if;
        end if;
      end if;
    end loop;

    update public.recipes
      set deal_tags = new_tags,
          price = case when rec.servings > 0 then round((fixed_total + flexible_total) / rec.servings, 2) else round(fixed_total + flexible_total, 2) end,
          fixed_price = round(fixed_total, 2),
          flexible_price = round(flexible_total, 2)
      where id = rec.id;
  end loop;
end;
$$;

-- Same split for calories/protein, mirroring refresh_recipe_deal_tags'
-- fixed/flexible split above. Reuses scale_deal_nutrient/scale_reference_price
-- from 20260807030000_compute_recipe_nutrition.sql unchanged.
create or replace function public.refresh_recipe_nutrition()
returns void
language plpgsql
as $$
declare
  rec record;
  ing jsonb;
  deal_nutr record;
  staple record;
  ing_words text[];
  match_words text[];
  matched boolean;
  total_fixed_calories numeric;
  total_flexible_calories numeric;
  total_fixed_protein numeric;
  total_flexible_protein numeric;
  best_words int;
  best_cal numeric;
  best_protein numeric;
  best_basis text;
  best_package_grams numeric;
  scaled_cal numeric;
  scaled_protein numeric;
  unmatched_count int := 0;
begin
  for rec in select id, name, ingredients, servings from public.recipes loop
    total_fixed_calories := 0;
    total_flexible_calories := 0;
    total_fixed_protein := 0;
    total_flexible_protein := 0;

    for ing in select value from jsonb_array_elements(rec.ingredients) loop
      ing_words := public.normalize_words(ing->>'name');
      matched := false;
      best_words := 0; best_cal := null; best_protein := null;
      best_basis := null; best_package_grams := null;

      -- 1. Deal-tagged: fixed bucket, never flexed.
      for deal_nutr in
        select item_name, calories_per_100g, protein_per_100g, basis, package_grams
        from public.deal_item_nutrition_reference
        where reviewed_by is not null
      loop
        match_words := public.normalize_words(deal_nutr.item_name);
        if array_length(match_words, 1) > 0
           and match_words <@ ing_words
           and array_length(match_words, 1) > best_words
        then
          best_cal := deal_nutr.calories_per_100g;
          best_protein := deal_nutr.protein_per_100g;
          best_basis := deal_nutr.basis;
          best_package_grams := deal_nutr.package_grams;
          best_words := array_length(match_words, 1);
        end if;
      end loop;

      if best_cal is not null then
        scaled_cal := public.scale_deal_nutrient(ing->>'quantity', ing->>'unit', ing->>'name', best_cal, best_basis, best_package_grams);
        scaled_protein := public.scale_deal_nutrient(ing->>'quantity', ing->>'unit', ing->>'name', best_protein, best_basis, best_package_grams);
        if scaled_cal is not null or scaled_protein is not null then
          matched := true;
          total_fixed_calories := total_fixed_calories + coalesce(scaled_cal, 0);
          total_fixed_protein := total_fixed_protein + coalesce(scaled_protein, 0);
        end if;
      end if;

      -- 2. Generic staples: flexible bucket -- scaleMealToTargets can
      -- scale this portion up/down to help hit a target.
      if not matched then
        best_words := 0; best_cal := null; best_protein := null;
        for staple in
          select ingredient_name, calories_per_100g, protein_per_100g
          from public.staple_reference_prices
          where nutrition_reviewed_by is not null
          union all
          select ingredient_name, calories_per_100g, protein_per_100g
          from public.statcan_reference_prices
          where nutrition_reviewed_by is not null
        loop
          match_words := public.normalize_words(staple.ingredient_name);
          if array_length(match_words, 1) > 0
             and match_words <@ ing_words
             and array_length(match_words, 1) > best_words
          then
            best_cal := staple.calories_per_100g;
            best_protein := staple.protein_per_100g;
            best_words := array_length(match_words, 1);
          end if;
        end loop;

        if best_cal is not null then
          scaled_cal := public.scale_reference_price(ing->>'quantity', ing->>'unit', ing->>'name', best_cal, '100 g');
          scaled_protein := public.scale_reference_price(ing->>'quantity', ing->>'unit', ing->>'name', best_protein, '100 g');
          if scaled_cal is not null or scaled_protein is not null then
            matched := true;
            total_flexible_calories := total_flexible_calories + coalesce(scaled_cal, 0);
            total_flexible_protein := total_flexible_protein + coalesce(scaled_protein, 0);
          end if;
        end if;
      end if;

      if not matched then
        unmatched_count := unmatched_count + 1;
        raise notice 'refresh_recipe_nutrition: no reviewed nutrition match for "%" in recipe "%"', ing->>'name', rec.name;
      end if;
    end loop;

    update public.recipes
      set calories = case when rec.servings > 0 then round((total_fixed_calories + total_flexible_calories) / rec.servings) else round(total_fixed_calories + total_flexible_calories) end,
          protein = case when rec.servings > 0 then round((total_fixed_protein + total_flexible_protein) / rec.servings, 1) else round(total_fixed_protein + total_flexible_protein, 1) end,
          fixed_calories = round(total_fixed_calories, 2),
          flexible_calories = round(total_flexible_calories, 2),
          fixed_protein = round(total_fixed_protein, 2),
          flexible_protein = round(total_flexible_protein, 2)
      where id = rec.id;
  end loop;

  if unmatched_count > 0 then
    raise notice 'refresh_recipe_nutrition: % ingredient(s) had no reviewed nutrition match, contributed 0', unmatched_count;
  end if;
end;
$$;

select public.refresh_recipe_deal_tags();
select public.refresh_recipe_nutrition();
