-- Table/column audit (2026-08-08), requested after Anabelle wanted to pause
-- recipe work and get the schema tight and clean before continuing. Full
-- accounting of what's dropped and why is in project memory; summary here.
--
-- Dropped as leftovers from the original architecture-doc scaffold
-- (20260725163230_init_schema.sql), confirmed to have zero live code
-- references and to model a product shape the app no longer has:
--   - sessions: built for anonymous Supabase auth (every guest gets a real
--     auth session row from first launch). Never adopted -- lib/auth.tsx
--     has no signInAnonymously call anywhere; guest mode today is simply
--     no session at all.
--   - meal_plans (and its household_members child, already dropped by
--     Anabelle directly before this migration): modeled per-generation AI
--     meal plans (cost_diversity_slider, combined_exclusions,
--     generated_meals jsonb). Today's model is a fixed recipe catalog
--     checked off client-side (lib/selectedMeals.tsx) -- a real future
--     "sync selected meals" feature would need a much simpler shape
--     (user_id + recipe_ids) than this one, so keeping it doesn't save
--     future work.
--
-- Explicitly KEPT despite being empty right now, per Anabelle: "features
-- like saving recipes, preferences, etc are still relevant. Might be
-- empty for now because we are not working on it":
--   - users: has notification_prefs, the real future home for user
--     preferences once that's built.
--   - saved_recipes: the heart/save-recipe feature is already live UI
--     (Profile tab), just client-local-only for now
--     (lib/savedRecipes.tsx) -- this is where it lands once wired to a
--     real account.
drop table if exists public.meal_plans;
drop table if exists public.sessions;

-- Dead columns from the now-archived scaleMealToTargets approach
-- (lib/dealNutrition.ts, staple multiplier flexing -- see the
-- archive/dynamic-meal-scaling branch), which needed a recipe's totals
-- split into a "can't flex" (deal-tagged anchor) and "can flex" (generic
-- staple) portion. The sort-not-scale pivot on 2026-08-07 removed the
-- only client-side consumer (lib/mealData.ts's Meal.fixedCalories etc
-- were mapped from these columns but never read by any component) --
-- confirmed via a full grep of app/ before dropping. refresh_recipe_deal_
-- tags()/refresh_recipe_nutrition() are redefined below to stop
-- maintaining the split and go back to a single running total, matching
-- what's actually used (price/calories/protein).
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
  total numeric;
  best_staple_price numeric;
  best_staple_unit text;
  best_staple_words int;
  scaled numeric;
  ing_ua public.unit_amount;
  package_count numeric;
  tag_price numeric;
  tag_original_price numeric;
begin
  for rec in select id, ingredients, servings from public.recipes loop
    new_tags := '[]'::jsonb;
    total := 0;

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
          -- How many whole packages this ingredient line actually needs
          -- -- "2 pack"/"3 cans" parse to base_unit 'each' with amount 2
          -- or 3; anything else (a gram/mL amount of a single package,
          -- an unparseable/blank quantity) stays at exactly 1 (see
          -- 20260808000000_scale_deal_price_by_quantity.sql).
          ing_ua := public.parse_unit_amount(ing->>'quantity', ing->>'unit');
          package_count := case
            when ing_ua.base_unit = 'each' and ing_ua.amount is not null and ing_ua.amount > 1
              then ing_ua.amount
            else 1
          end;
          tag_price := round(deal.price * package_count, 2);
          tag_original_price := round(deal.original_price * package_count, 2);

          new_tags := new_tags || jsonb_build_object(
            'name', ing->>'name',
            'store', deal.chain_name,
            'image_url', deal.image_url,
            'price', tag_price,
            'original_price', tag_original_price,
            'discount_pct', round((1 - tag_price / tag_original_price) * 100),
            'quantity_estimated', false
          );
          total := total + tag_price;
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
end;
$$;

comment on function public.refresh_recipe_deal_tags() is
  'Rebuilds deal_tags and price for every recipe from scratch against the current curated_deals table. A deal-tagged ingredient credits its package price once per whole package the recipe''s stated quantity/unit calls for (parse_unit_amount, base_unit=''each'', amount>1) -- a sub-package quantity (e.g. "450 g" of a bigger pack) still credits exactly one package, since that''s what you''d actually buy. Deterministic word-subset matching only -- no brand-substitution guessing. Call after every curated_deals sync (see scripts/sync-deals) or after editing a recipe''s ingredients.';

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
  total_calories numeric;
  total_protein numeric;
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
    total_calories := 0;
    total_protein := 0;

    for ing in select value from jsonb_array_elements(rec.ingredients) loop
      ing_words := public.normalize_words(ing->>'name');
      matched := false;
      best_words := 0; best_cal := null; best_protein := null;
      best_basis := null; best_package_grams := null;

      -- 1. Deal-tagged items.
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
          total_calories := total_calories + coalesce(scaled_cal, 0);
          total_protein := total_protein + coalesce(scaled_protein, 0);
        end if;
      end if;

      -- 2. Generic staples.
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
            total_calories := total_calories + coalesce(scaled_cal, 0);
            total_protein := total_protein + coalesce(scaled_protein, 0);
          end if;
        end if;
      end if;

      if not matched then
        unmatched_count := unmatched_count + 1;
        raise notice 'refresh_recipe_nutrition: no reviewed nutrition match for "%" in recipe "%"', ing->>'name', rec.name;
      end if;
    end loop;

    update public.recipes
      set calories = case when rec.servings > 0 then round(total_calories / rec.servings) else round(total_calories) end,
          protein = case when rec.servings > 0 then round(total_protein / rec.servings, 1) else round(total_protein, 1) end
      where id = rec.id;
  end loop;

  if unmatched_count > 0 then
    raise notice 'refresh_recipe_nutrition: % ingredient(s) had no reviewed nutrition match, contributed 0', unmatched_count;
  end if;
end;
$$;

comment on function public.refresh_recipe_nutrition() is
  'Rebuilds calories/protein for every recipe from scratch off ingredients, matching deal-tagged items against deal_item_nutrition_reference and generic staples against staple_reference_prices/statcan_reference_prices (nutrition_reviewed_by is not null only). Call after editing a recipe''s ingredients or syncing new nutrition data.';

-- Now safe to drop -- both functions above no longer reference these.
alter table public.recipes
  drop column fixed_price,
  drop column flexible_price,
  drop column fixed_calories,
  drop column flexible_calories,
  drop column fixed_protein,
  drop column flexible_protein;

-- staple_reference_prices.category (base_staple/rounding_out_extra) was
-- part of the original scaffold's design; the real staple-matching logic
-- (refresh_recipe_deal_tags/refresh_recipe_nutrition, lib/staplePrices.ts)
-- is entirely name-based word-subset matching and has never read this
-- column -- confirmed via a full grep of app/ before dropping.
alter table public.staple_reference_prices drop column category;
drop type if exists public.staple_category;

-- Recompute every recipe's price/calories/protein now that the fixed/
-- flexible split is gone, confirming the simplified functions produce
-- the same numbers as before (they should -- same matching logic, just
-- one running total instead of two).
select public.refresh_recipe_deal_tags();
select public.refresh_recipe_nutrition();
