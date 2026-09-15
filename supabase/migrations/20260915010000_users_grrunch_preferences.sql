-- Settings > Manage account "Grrunch preferences" (Anabelle, 2026-09-15:
-- "In manage my account we should add those fields without being
-- mandatory: ... Postal code, Household size, Preferred stores, Dietary
-- preferences") -- optional profile signals, same lazily-created
-- public.users row full_name/phone already live in
-- (20260828000000_users_profile_fields.sql). None of these drive any
-- real filtering/personalization logic yet -- no recipe generation or
-- store-matching reads them today. This migration only adds the columns
-- and gives ManageAccountSection.tsx its first writer; wiring them into
-- actual personalization is separate, future work.
alter table public.users add column postal_code text;
alter table public.users add column household_size smallint;
-- Chain names, matching lib/dealZones.ts's ZONES_BY_CHAIN keys exactly
-- (Safeway, Save-On-Foods, Real Canadian Superstore, Walmart, No
-- Frills). A lightweight multi-select preference signal, NOT the
-- precise, location-picked "My stores" list (lib/selectedStores.tsx --
-- local-only AsyncStorage, used for actual pricing/zone-matching).
-- Someone can prefer a chain here without having picked a specific
-- location for it.
alter table public.users add column preferred_stores text[] not null default '{}';
alter table public.users add column dietary_preferences text[] not null default '{}';

comment on column public.users.postal_code is
  'Optional, user-entered, free text -- not validated/normalized, and not currently read by any store-matching or other logic.';
comment on column public.users.household_size is
  'Optional headcount, 1+ if set. Not currently used to scale any recipe/pricing logic.';
comment on column public.users.preferred_stores is
  'Optional multi-select from the 5 known chain names (see lib/dealZones.ts ZONES_BY_CHAIN) -- a preference signal, distinct from the precise, location-specific "My stores" list. Not currently read by any matching logic.';
comment on column public.users.dietary_preferences is
  'Optional multi-select (Vegetarian, Vegan, Gluten-free, Dairy-free, Nut-free, Halal, Kosher, Low-carb) -- not currently used to filter recipes.';
