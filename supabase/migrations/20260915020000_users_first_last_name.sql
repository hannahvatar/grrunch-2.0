-- Anabelle, 2026-09-15 (immediate follow-up in the same session): "name
-- should also be 'first name' 'last name'" -- splits the single
-- full_name column (added 20260828000000_users_profile_fields.sql,
-- ManageAccountSection.tsx/lib/profile.ts its only reader/writer,
-- confirmed via a repo-wide grep) into two real columns instead of
-- parsing/joining a combined string client-side.
alter table public.users add column first_name text;
alter table public.users add column last_name text;
alter table public.users drop column full_name;
