-- "1 cup Frozen peas" (Kraft Dinner alla Carbonara revamp) is
-- volume-measured but any real peas reference is weight-denominated --
-- same cup<->g bridge gap as basil/ginger/black pepper before it. ~145
-- g/cup for frozen peas (standard USDA measure), same "small and
-- approximate" policy as every other staple_densities entry.
insert into public.staple_densities (ingredient_name, grams_per_cup) values
  ('Frozen peas', 145);

select public.refresh_recipe_deal_tags();
select public.refresh_recipe_nutrition();
