-- "1/4 cup, torn Fresh basil" (TikTok Baked Feta Pasta) had no density
-- entry -- fresh basil leaves are volume-measured in every recipe using
-- them (never sold/priced by the cup), so without a cup<->g bridge the
-- ingredient can never reach a gram-denominated reference price/
-- nutrition figure no matter how good that reference's own coverage is.
-- ~21 g/cup for loosely packed fresh basil leaves (standard estimate,
-- same "small and approximate, expand as it comes up" policy as every
-- other staple_densities entry).
insert into public.staple_densities (ingredient_name, grams_per_cup) values
  ('Basil', 21);
