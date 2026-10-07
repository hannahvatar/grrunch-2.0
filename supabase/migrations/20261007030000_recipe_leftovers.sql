-- A "Leftovers" section at the bottom of the recipe page (Anabelle,
-- 2026-10-07): what to do with what's left of a big pack, e.g. the rest
-- of a bone-in ham portion. Shown in its own card; null hides it.
alter table public.recipes add column if not exists leftovers text;
