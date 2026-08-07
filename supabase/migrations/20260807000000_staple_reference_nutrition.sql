-- Same reasoning as deal_item_nutrition_reference (see that table's
-- migration): scaleMealToTargets currently scales a recipe's single
-- static calories/protein number by serving count alone. Making that
-- number actually reflect ingredients requires nutrition data for BOTH
-- the deal-tagged anchor item (done) AND the generic staples that fill
-- out the rest of the dish (rice, garlic, oil, etc. -- not done until
-- this migration). staple_reference_prices already matches these exact
-- ingredients for pricing via the same word-subset convention used
-- everywhere else in this schema, so nutrition lives here too rather
-- than in a new table.
--
-- nutrition_reviewed_by is deliberately separate from this table's
-- existing checked_by/last_checked_at (which verify the PRICE) --
-- verifying one doesn't verify the other, and USDA-matched nutrition
-- needs the same human-check gate deal_item_nutrition_reference's
-- reviewed_by enforces (confirmed necessary there: real wrong matches
-- slipped past automated confidence scoring more than once).
alter table public.staple_reference_prices
  add column calories_per_100g numeric(10, 2) check (calories_per_100g >= 0),
  add column protein_per_100g numeric(10, 2) check (protein_per_100g >= 0),
  add column nutrition_source text check (nutrition_source in ('usda', 'manual')),
  add column nutrition_reviewed_by text;

comment on column public.staple_reference_prices.nutrition_reviewed_by is
  'Null until a human has checked calories_per_100g/protein_per_100g against a real source and confirmed it -- same policy as deal_item_nutrition_reference.reviewed_by. Nothing in the app should read a row''s nutrition where this is null.';
