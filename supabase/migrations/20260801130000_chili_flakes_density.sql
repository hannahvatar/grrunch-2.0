-- "Chili flakes" already has a real, human-verified reference price
-- ($4.50/100g), but nothing bridged the recipe's volume quantity
-- ("1/2 tsp") to that weight-based reference -- scale_reference_price
-- silently contributed $0 for it, same class of gap flour/sugar/rice
-- already had a density entry for. ~80 g/cup is an approximate but
-- reasonable figure for crushed red pepper flakes; the quantities
-- involved are always small (a teaspoon or two), so precision here
-- barely moves the price.
insert into public.staple_densities (ingredient_name, grams_per_cup) values
  ('Chili flakes', 80)
on conflict (ingredient_name) do nothing;

select public.refresh_recipe_deal_tags();
