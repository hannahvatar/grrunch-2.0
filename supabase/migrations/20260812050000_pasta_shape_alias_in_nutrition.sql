-- Companion to 20260812040000: that migration restored the pasta-shape
-- alias bridge (staple_alias_words()) to refresh_recipe_deal_tags()'s
-- PRICING match, but refresh_recipe_nutrition() never had it at all --
-- it's a separate function (20260808020000_produce_reference_nutrition.sql
-- and its ancestors) that was never touched by the original
-- 20260801080000 pasta-shape work. Only "Spaghetti" carries reviewed
-- nutrition (calories_per_100g/protein_per_100g, nutrition_reviewed_by
-- = 'anabelle') -- any other pasta shape (Penne, Rigatoni, Macaroni,
-- generic "Pasta", ...) has always contributed 0 calories/0 protein,
-- silently, with no reviewed row of its own to fall back to. Found
-- while adding "TikTok Baked Feta Pasta" ("Pasta (penne or rigatoni)"):
-- price now correctly credits via the alias bridge, but calories/
-- protein still came back 0/0 for the same ingredient since nutrition
-- matching had no bridge to reach Spaghetti's own reviewed numbers.
--
-- This does NOT fabricate any new trust -- nutrition_reviewed_by stays
-- exactly as reviewed (Spaghetti's own real number, checked by
-- Anabelle); this only widens which ingredient NAMES can reach an
-- already-reviewed row, same as the pricing-side fix.

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
begin
  for rec in select id, name, ingredients, servings from public.recipes loop
    total_calories := 0;
    total_protein := 0;

    for ing in select value from jsonb_array_elements(rec.ingredients) loop
      ing_words := public.normalize_words(ing->>'name');
      matched := false;
      best_words := 0; best_cal := null; best_protein := null;
      best_basis := null; best_package_grams := null;

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
        scaled_cal := public.scale_deal_nutrient(ing->>'quantity', ing->>'unit', ing->>'name', best_cal, best_basis, best_package_grams);
        scaled_protein := public.scale_deal_nutrient(ing->>'quantity', ing->>'unit', ing->>'name', best_protein, best_basis, best_package_grams);
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
  'Rebuilds calories/protein for every recipe from scratch off ingredients, matching deal-tagged items against deal_item_nutrition_reference (literal match) and generic staples/produce against staple_reference_prices/statcan_reference_prices/produce_reference_prices (nutrition_reviewed_by is not null only) -- the generic tier runs both the ingredient''s and every candidate reference row''s words through staple_alias_words() first, same pasta-shape bridge (Penne/Rigatoni/Macaroni/... -> "pasta") as refresh_recipe_deal_tags()''s own staple-fallback tier, so a pasta shape with no dedicated reviewed row of its own can still reach another shape''s (e.g. Spaghetti''s) reviewed numbers. Call after editing a recipe''s ingredients or syncing new nutrition data.';

-- Re-materialize every recipe -- expected to change calories/protein
-- only for recipes naming a pasta shape with no dedicated reviewed
-- nutrition row of its own (this migration's own trigger case);
-- anything already matching a literal reviewed row (e.g. Spaghetti)
-- is untouched.
select public.refresh_recipe_nutrition();
