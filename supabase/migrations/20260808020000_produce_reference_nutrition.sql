-- Closes a real gap found during the 2026-08-08 table audit: produce_
-- reference_prices (the 3rd-tier price fallback for generic produce
-- that isn't currently deal-tagged -- see refresh_recipe_deal_tags'
-- statcan -> produce -> staple order) had no nutrition columns at all,
-- and refresh_recipe_nutrition() never queried it -- unlike staple_
-- reference_prices/statcan_reference_prices, which both got this same
-- treatment in 20260807000000/20260807010000. A produce ingredient
-- currently gets real nutrition only while it happens to also be
-- deal-tagged (via deal_item_nutrition_reference); the moment that
-- deal rotates off the flyer, its nutrition contribution silently
-- drops to zero with no review queue to ever recover it. Not
-- currently affecting any live recipe (every produce ingredient in
-- use today is deal-tagged), but a real latent gap -- same column
-- shape and review-gate policy as the other two nutrition tables.
alter table public.produce_reference_prices
  add column calories_per_100g numeric(10, 2) check (calories_per_100g >= 0),
  add column protein_per_100g numeric(10, 2) check (protein_per_100g >= 0),
  add column nutrition_source text check (nutrition_source in ('usda', 'manual')),
  add column nutrition_reviewed_by text;

comment on column public.produce_reference_prices.nutrition_reviewed_by is
  'Null until a human has checked calories_per_100g/protein_per_100g against a real source and confirmed it -- same policy as deal_item_nutrition_reference.reviewed_by / staple_reference_prices.nutrition_reviewed_by / statcan_reference_prices.nutrition_reviewed_by. Nothing in the app should read a row''s nutrition where this is null.';

-- Adds produce_reference_prices into the same generic-staple nutrition
-- match as staple_reference_prices/statcan_reference_prices -- whichever
-- of the three has the best (longest) word match wins, same rule as
-- before, now just one more table in the union.
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

      -- 2. Generic staples/produce.
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
          union all
          select ingredient_name, calories_per_100g, protein_per_100g
          from public.produce_reference_prices
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
  'Rebuilds calories/protein for every recipe from scratch off ingredients, matching deal-tagged items against deal_item_nutrition_reference and generic staples/produce against staple_reference_prices/statcan_reference_prices/produce_reference_prices (nutrition_reviewed_by is not null only). Call after editing a recipe''s ingredients or syncing new nutrition data.';

select public.refresh_recipe_nutrition();
