-- Backs the nearest-stores Google Places lookup (architecture.md 3.1).
-- Needed so repeated location lookups upsert the same row per physical
-- store instead of inserting a duplicate `stores` row every time.
alter table public.stores
  add column google_place_id text unique;
