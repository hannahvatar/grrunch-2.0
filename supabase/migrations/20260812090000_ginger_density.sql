-- "1 tsp Fresh ginger" (Instant Pork Ramen Soup) is volume-measured (a
-- recipe never calls for ginger by weight), but its reference price is
-- weight-denominated ($/lb) -- same cup<->g bridge gap as basil, olive
-- oil, chili flakes before it. ~96 g/cup for grated ginger (~6g/tbsp,
-- 16 tbsp/cup), same "small and approximate, expand as it comes up"
-- policy as every other staple_densities entry.
insert into public.staple_densities (ingredient_name, grams_per_cup) values
  ('Ginger', 96);
