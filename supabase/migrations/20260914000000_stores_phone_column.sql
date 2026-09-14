-- Adds `phone` to `stores` -- needed for the new "Select a Store" picker
-- (Anabelle, 2026-09-14: "copy the store selection process from canadian
-- tire and apply to our store" -- their picker shows a phone number per
-- location). nearest-stores/index.ts never requested phone from Google
-- Places at all (its field mask stopped at regularOpeningHours), so this
-- is a genuinely new field, not previously-fetched-but-unused data like
-- `hours` was.
--
-- Nullable: Places doesn't always return nationalPhoneNumber for a given
-- place, and older rows upserted before this column existed have no value
-- to backfill.
alter table public.stores add column phone text;

comment on column public.stores.phone is
  'Google Places nationalPhoneNumber for this location, when Places returns one. Populated by search-stores/index.ts (the multi-result picker) and, going forward, nearest-stores/index.ts -- null for rows upserted before this column existed or where Places had no phone on file.';
