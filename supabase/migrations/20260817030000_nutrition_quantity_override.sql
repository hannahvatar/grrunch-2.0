-- Inverse of 20260817020000's price_quantity/price_unit: Anabelle
-- wants K-Pogo's deep-frying oil to actually READ "500 mL" (the real
-- amount you buy/pour to submerge the pogos -- the honest shopping/
-- display quantity), while nutrition still credits only the ~30 mL
-- actually absorbed. Making quantity/unit the real 500 mL (so display
-- AND cost both scale off it naturally, no price_quantity override
-- needed anymore for this ingredient) means NUTRITION now needs its
-- own opt-out instead -- the exact mirror problem, solved the same way.
--
-- Adds nutrition_quantity/nutrition_unit, optional ingredient JSON
-- keys read ONLY by refresh_recipe_nutrition() via coalesce -- absent
-- on every existing ingredient today, so this is a true no-op
-- everywhere except a row that explicitly opts in. price_quantity/
-- price_unit (20260817020000) is untouched and still available
-- separately -- the two overrides are independent and can be used
-- together or alone depending on which of {display+cost, nutrition}
-- needs to diverge from the real quantity.
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
  alias_ing_words text[];
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
  nutr_quantity text;
  nutr_unit text;
begin
  for rec in select id, name, ingredients, servings from public.recipes loop
    total_calories := 0;
    total_protein := 0;

    for ing in select value from jsonb_array_elements(rec.ingredients) loop
      ing_words := public.normalize_words(ing->>'name');
      matched := false;
      best_words := 0; best_cal := null; best_protein := null;
      best_basis := null; best_package_grams := null;
      nutr_quantity := coalesce(ing->>'nutrition_quantity', ing->>'quantity');
      nutr_unit := coalesce(ing->>'nutrition_unit', ing->>'unit');

      -- 1. Deal-tagged items -- literal match only, same as pricing's
      -- own deal-credit passes (no shape aliasing for actual flyer
      -- deals, only for the generic staple fallback below).
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
        scaled_cal := public.scale_deal_nutrient(nutr_quantity, nutr_unit, ing->>'name', best_cal, best_basis, best_package_grams);
        scaled_protein := public.scale_deal_nutrient(nutr_quantity, nutr_unit, ing->>'name', best_protein, best_basis, best_package_grams);
        if scaled_cal is not null or scaled_protein is not null then
          matched := true;
          total_calories := total_calories + coalesce(scaled_cal, 0);
          total_protein := total_protein + coalesce(scaled_protein, 0);
        end if;
      end if;

      -- 2. Generic staples/produce -- aliased both ways, same pasta-
      -- shape bridge as the pricing function's staple-fallback tier.
      if not matched then
        best_words := 0; best_cal := null; best_protein := null;
        alias_ing_words := public.staple_alias_words(ing_words);

        for staple in
          select ingredient_name, calories_per_100g, protein_per_100g
          from public.staple_reference_prices
          where nutrition_reviewed_by is not null
          union all
          select ingredient_name, calories_per_100g, protein_per_100g
          from public.statcan_reference_prices
          where nutrition_reviewed_by is not null
          union all
          select ingredient_name, calories_per_100g, protein_per_100g
          from public.produce_reference_prices
          where nutrition_reviewed_by is not null
        loop
          match_words := public.staple_alias_words(public.normalize_words(staple.ingredient_name));
          if array_length(match_words, 1) > 0
             and match_words <@ alias_ing_words
             and array_length(match_words, 1) > best_words
          then
            best_cal := staple.calories_per_100g;
            best_protein := staple.protein_per_100g;
            best_words := array_length(match_words, 1);
          end if;
        end loop;

        if best_cal is not null then
          scaled_cal := public.scale_reference_price(nutr_quantity, nutr_unit, ing->>'name', best_cal, '100 g');
          scaled_protein := public.scale_reference_price(nutr_quantity, nutr_unit, ing->>'name', best_protein, '100 g');
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
  'Rebuilds calories/protein for every recipe from scratch. Two-tier match per ingredient: (1) deal-tagged items via deal_item_nutrition_reference (literal match only), (2) generic staples/produce/statcan via the pasta-shape alias bridge (staple_alias_words). Both tiers honor an optional per-ingredient nutrition_quantity/nutrition_unit override (coalesced with quantity/unit when absent) -- lets nutrition diverge from the real quantity when what''s eaten is less than what''s bought (e.g. deep-frying oil: buy/pour 500 mL to submerge the food, but only ~30 mL is actually absorbed) -- the inverse of price_quantity/price_unit (20260817020000_staple_price_quantity_override.sql), which lets COST diverge from the real quantity instead. The two overrides are independent.';

select public.refresh_recipe_nutrition();
