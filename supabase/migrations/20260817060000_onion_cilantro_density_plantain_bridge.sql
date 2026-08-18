-- Jamaican Patty's real spec (Anabelle) states red onion/cilantro as
-- cup measures ("1/2 cup finely chopped red onion", "1/4 cup chopped
-- cilantro") -- same bug class as olive oil/milk before them
-- (20260807050000/20260813...): neither ingredient had a
-- staple_densities row, so a cup-based quantity would silently
-- contribute $0/0 nutrition (scale_reference_price has no ml->g bridge
-- without one). Real-world reference values: ~160 g/cup finely
-- chopped onion, ~16 g/cup loosely-packed chopped cilantro (same
-- ballpark as basil's existing 21 g/cup entry).
insert into public.staple_densities (ingredient_name, grams_per_cup) values
  ('onion', 160),
  ('red onion', 160),
  ('cilantro', 16);

-- Plantain avg-weight bridge -- not currently load-bearing for pricing
-- (Jamaican Patty states plantain quantity directly in grams, which
-- prices correctly against the lb-rate deal on its own), but added for
-- the client's describeUseQuantityText "Recipe uses N plantains"
-- display note (see the matching STAPLE_AVG_WEIGHT_G_PER_EACH/
-- DEAL_ITEM_UNIT_LABELS client mirror), same real-world estimate (180
-- g/plantain) used to convert Anabelle's "5 plantains" into the
-- recipe's stored 900 g.
insert into public.staple_avg_weights (ingredient_name, grams_each) values
  ('plantain', 180);
