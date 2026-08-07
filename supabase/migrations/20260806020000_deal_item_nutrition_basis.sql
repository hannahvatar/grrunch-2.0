-- Open Food Facts reports every product's nutrition under the same field
-- name, "energy-kcal_100g"/"proteins_100g", whether the product is a solid
-- (grams) or a liquid (real basis: per 100ml) -- there's no separate
-- "_100ml" field to check instead. Confirmed directly against the API: a
-- 330ml Coca-Cola's "energy-kcal_100g" is 42.1, which is the real, well-
-- known calories-per-100ML figure for Coca-Cola, not a mistake -- just
-- OFF's field-naming convention never changing to reflect the product's
-- actual unit. deal_item_nutrition_reference's calories_per_100g/
-- protein_per_100g columns inherited that same ambiguity by copying the
-- field value without recording which basis it's actually in -- exactly
-- the kind of silent unit-conflation lib/unitConversion.ts's whole
-- design (separate ml/g/each base units, explicit density bridging)
-- exists to avoid.
--
-- 'per_100g' stays the default (correct for USDA matches, which really
-- are per-100g even for liquids per USDA's own convention, and for any
-- OFF match not categorized as a ready-to-drink beverage).
alter table public.deal_item_nutrition_reference
  add column basis text not null default 'per_100g'
    check (basis in ('per_100g', 'per_100ml'));

comment on column public.deal_item_nutrition_reference.basis is
  'Whether calories_per_100g/protein_per_100g are actually per 100 grams or per 100 millilitres -- see migration header. Set from Open Food Facts categories_tags (en:beverages/en:sodas/en:waters/en:fruit-juices etc -> per_100ml) at sync time; USDA matches are always per_100g (USDA''s own convention, even for liquids).';
