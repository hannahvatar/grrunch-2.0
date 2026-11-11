-- The size unit as the flyer prints it (Anabelle, 2026-11-11: "Farmer's
-- Market Ambrosia Apples shows 5 lb but you fill in 2268 gr. Keep original
-- unit", as a general rule). package_weight_g / package_volume_ml stay the
-- source of truth for pricing; this only says how to show that size back:
-- 2268 g + 'lb' reads "5 lb" in dev-deals and on the deal's price. Null =
-- not known (older rows), shown in g / ml as before.
alter table public.curated_deals
  add column if not exists package_size_unit text
  check (package_size_unit in ('g', 'kg', 'lb', 'ml', 'L'));
