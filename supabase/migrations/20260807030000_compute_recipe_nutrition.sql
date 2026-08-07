-- Phase 2a: recipes.calories/protein have been static, hand-authored
-- numbers since the recipes table was created -- not derived from the
-- ingredients at all. This computes them for real, the same way
-- refresh_recipe_deal_tags() computes recipes.price from ingredients +
-- reference tables, reusing the exact same matching (normalize_words,
-- word-subset) and scaling (parse_unit_amount, scale_reference_price)
-- machinery so a recipe's price and nutrition are always derived
-- consistently from the same underlying data.
--
-- Only ever reads reviewed rows (deal_item_nutrition_reference.reviewed_by,
-- staple_reference_prices/statcan_reference_prices.nutrition_reviewed_by)
-- -- an ingredient with no reviewed match contributes 0 and is logged via
-- raise notice rather than guessed, same policy as everywhere else in
-- this pipeline.

-- Bridges one case scale_reference_price can't handle on its own: a
-- deal-tagged ingredient bought as a whole package ("1 pack", not a
-- weight) -- correct for pricing (you can't fragment a package at
-- checkout, see refresh_recipe_deal_tags), but nutrition needs to know
-- how many grams that package actually is. Falls back to
-- calories_per_100g/protein_per_100g * package_grams/100 only when the
-- normal weight/volume scaling path returns null AND the recipe's
-- quantity resolves to a plain count ('each') AND a package weight is
-- known (see package_grams / package_grams_source on
-- deal_item_nutrition_reference).
create or replace function public.scale_deal_nutrient(
  recipe_quantity text,
  recipe_unit text,
  ingredient_name text,
  per_100_value numeric,
  basis text,
  package_grams numeric
)
returns numeric
language plpgsql
as $$
declare
  scaled numeric;
  ua public.unit_amount;
begin
  if per_100_value is null then
    return null;
  end if;

  scaled := public.scale_reference_price(
    recipe_quantity, recipe_unit, ingredient_name, per_100_value,
    case when basis = 'per_100ml' then '100 ml' else '100 g' end
  );
  if scaled is not null then
    return scaled;
  end if;

  -- per_100ml items in this data are always sold by volume, never as a
  -- discrete package count, so the package_grams fallback only applies
  -- to per_100g references.
  if basis = 'per_100g' and package_grams is not null then
    ua := public.parse_unit_amount(recipe_quantity, recipe_unit);
    if ua.base_unit = 'each' and ua.amount is not null then
      return round(per_100_value * (ua.amount * package_grams / 100), 4);
    end if;
  end if;

  return null;
end;
$$;

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

      -- 1. Deal-tagged ingredients: reviewed nutrition reference only,
      -- most-specific word-subset match wins (mirrors refresh_recipe_deal_tags).
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

      -- 2. Generic staples: staple_reference_prices first, then
      -- statcan_reference_prices -- same priority order as
      -- sync_staple_nutrition.py's locate_table(), both gated on
      -- nutrition_reviewed_by. Always weight-denominated (per_100g) --
      -- a non-deal-tagged ingredient always states a weight/volume in
      -- this data, never a package count.
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

select public.refresh_recipe_nutrition();
