-- Real gap found while investigating why "Pork Back Ribs with Roasted
-- Cauliflower" had flexible_calories = 0 despite using 15mL olive oil:
-- staple_densities had no entry for any oil, so scale_reference_price
-- could never bridge a recipe's mL quantity to the staple reference's
-- per-100g price/nutrition rate -- olive oil silently contributed 0 to
-- both price and nutrition in EVERY recipe using it (6 of 9), not just
-- this one. The other 5 masked it by also having a bigger staple (rice,
-- potatoes) carrying most of the flexible total; this recipe has no such
-- staple, so the gap was fully exposed.
--
-- 0.92 g/mL is standard olive oil density -- 236.588 mL/cup * 0.92 g/mL.
insert into public.staple_densities (ingredient_name, grams_per_cup) values
  ('Olive oil', 217.7);

select public.refresh_recipe_deal_tags();
select public.refresh_recipe_nutrition();
