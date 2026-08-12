-- "2 packs Instant ramen noodles" prices fine directly (both the
-- ingredient and the new "Instant ramen noodles" reference collapse to
-- the same 'each' base_unit, straight package-count crediting -- no
-- bridge needed for that side), but refresh_recipe_nutrition() always
-- compares against a fixed '100 g' basis, so nutrition needs the
-- each<->g bridge to reach it. One pack is 85g (per Anabelle's own
-- recipe: "packs (85g each)").
insert into public.staple_avg_weights (ingredient_name, grams_each) values
  ('Instant ramen noodles', 85);
