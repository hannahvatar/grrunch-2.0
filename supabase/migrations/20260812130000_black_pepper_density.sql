-- "1.5 tsp, freshly ground Black pepper" (Kraft Dinner alla Carbonara
-- revamp) had a real, human-verified reference ($44/kg) but no cup<->g
-- density bridge -- same gap class as basil/ginger before it -- so it
-- silently priced at $0 despite the reference existing and being
-- trusted. ~100 g/cup for ground black pepper, same "small and
-- approximate" policy as every other staple_densities entry.
insert into public.staple_densities (ingredient_name, grams_per_cup) values
  ('Black pepper', 100);

select public.refresh_recipe_deal_tags();
select public.refresh_recipe_nutrition();
