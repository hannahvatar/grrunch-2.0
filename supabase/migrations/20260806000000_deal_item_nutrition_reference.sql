-- Per-item calorie/protein reference data for curated_deals items --
-- Phase 1 of making scaleMealToTargets (lib/mealScaling.ts) work off real
-- ingredient-level nutrition instead of a single static calories/protein
-- number authored per recipe. This table only stores looked-up macros;
-- nothing in the app reads it yet (that's Phase 2 -- recipes.calories/
-- protein would need to become computed from ingredients the same way
-- recipes.price already is, and scaleMealToTargets would need a second
-- search dimension for adjustable staples, not just serving count).
--
-- Separate from curated_deals itself since curated_deals rotates weekly
-- with each flyer sync (scripts/sync_weekly_deals.py) while a product's
-- nutrition facts don't change week to week -- same reasoning that keeps
-- staple_reference_prices/produce_reference_prices/statcan_reference_prices
-- separate from the deals they get matched against.
--
-- Populated by scripts/sync_deal_nutrition.py: Open Food Facts first
-- (free, open, real nutrition labels for branded/packaged items -- e.g.
-- "Marcangelo Chicken Breast Kabobs Souvlaki" is a real, barcoded match),
-- falling back to USDA FoodData Central for generic/unbranded items
-- (loose produce, raw meat) that Open Food Facts doesn't carry. Anything
-- neither API can confidently match is left unsynced rather than guessed
-- -- same "leave the gap visible, never invent a number" policy as
-- produce_reference_prices.
create table public.deal_item_nutrition_reference (
  id uuid primary key default gen_random_uuid(),
  -- Matched verbatim against curated_deals.item_name / a recipe
  -- ingredient's name, same word-subset matching convention used by
  -- refresh_recipe_deal_tags().
  item_name text not null,
  brand text,
  source text not null check (source in ('openfoodfacts', 'usda')),
  calories_per_100g numeric(10, 2) not null check (calories_per_100g >= 0),
  protein_per_100g numeric(10, 2) not null check (protein_per_100g >= 0),
  -- The matched product's real package weight (e.g. 480 for "480g"),
  -- when the source provides one (Open Food Facts' own `quantity`
  -- field). Null for USDA matches, which are per-100g generic data with
  -- no package size -- a recipe line in "pack"/"bag"/"each" units
  -- matched to a USDA row has no way to resolve an actual gram amount
  -- without a separate estimate, same gap DealTag.quantityEstimated
  -- already flags for pricing.
  package_grams numeric(10, 2),
  barcode text,
  last_synced_at timestamptz not null default now(),
  unique (item_name)
);

alter table public.deal_item_nutrition_reference enable row level security;

create policy "deal_item_nutrition_reference is publicly readable" on public.deal_item_nutrition_reference
  for select using (true);

comment on table public.deal_item_nutrition_reference is
  'Per-100g calorie/protein reference data for curated_deals items, sourced from Open Food Facts (branded/packaged) or USDA FoodData Central (generic/fresh) by scripts/sync_deal_nutrition.py. Phase 1 only -- not yet read by the app; see migration header.';
