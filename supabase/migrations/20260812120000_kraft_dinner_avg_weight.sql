-- "Kraft Dinner alla Carbonara" switching its Kraft Dinner ingredient
-- from "225 g" to "1 package" (a standard KD box is 225g/7.25oz --
-- Anabelle's own existing quantity was already exactly one real box,
-- this is a display change, not a quantity change) -- the reference
-- price is denominated "per 200 grams" (not per-box), so "1
-- package"/'each' needs the same each<->g bridge as Eggs/Instant ramen
-- noodles to reach it, matching the identical 225g the recipe already
-- called for.
insert into public.staple_avg_weights (ingredient_name, grams_each) values
  ('Kraft Dinner', 225);
