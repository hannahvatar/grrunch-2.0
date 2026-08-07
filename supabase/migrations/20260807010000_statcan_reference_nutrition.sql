-- Same reasoning as staple_reference_nutrition.sql, for the one staple
-- ("Onions") that resolves via statcan_reference_prices instead of
-- staple_reference_prices for pricing. staple_reference_prices requires
-- category/avg_price/unit (all not null) so a nutrition-only row can't
-- live there without fabricating a competing price next to StatCan's
-- real figure -- nutrition belongs alongside the pricing data that
-- already matches this ingredient, same as everywhere else in this
-- schema.
--
-- Note statcan_reference_prices can hold multiple rows per
-- ingredient_name (one per geography/reference_month), unlike
-- staple_reference_prices' one-row-per-ingredient shape. Nutrition
-- (unlike price) doesn't vary by geography or month, so the sync
-- script writes the same value to every row sharing an ingredient_name
-- -- redundant, but harmless, and avoids needing a lookup that picks
-- "the right" row.
alter table public.statcan_reference_prices
  add column calories_per_100g numeric(10, 2) check (calories_per_100g >= 0),
  add column protein_per_100g numeric(10, 2) check (protein_per_100g >= 0),
  add column nutrition_source text check (nutrition_source in ('usda', 'manual')),
  add column nutrition_reviewed_by text;

comment on column public.statcan_reference_prices.nutrition_reviewed_by is
  'Null until a human has checked calories_per_100g/protein_per_100g against a real source and confirmed it -- same policy as deal_item_nutrition_reference.reviewed_by / staple_reference_prices.nutrition_reviewed_by. Nothing in the app should read a row''s nutrition where this is null.';
