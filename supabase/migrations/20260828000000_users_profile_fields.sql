-- Manage account UI (Anabelle, 2026-08-28: real name/phone editing under
-- Settings > Manage account). public.users is already the "profile row
-- extending auth.users" table sketched for exactly this in
-- 20260725163230_init_schema.sql ("created only when the user saves
-- something") -- no feature has actually written to it yet (saved_recipes/
-- meal_plans aren't wired into the app yet either), so this is its first
-- real column addition and first real writer, not a new table.
alter table public.users add column full_name text;
alter table public.users add column phone text;
