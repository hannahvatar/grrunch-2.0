-- refresh_recipe_deal_tags() is meant to be a safe, controlled
-- "recompute pricing" operation callable from anywhere (the weekly sync
-- script, the SQL editor, or in principle straight from the app) --
-- without needing to grant broad UPDATE access on recipes to whichever
-- role happens to call it.
--
-- It was running as SECURITY INVOKER (the default): fine when called via
-- the SQL editor or the service_role key (both privileged), but calling
-- it as the anon role silently updated nothing -- anon can SELECT
-- recipes (public read policy) but has no UPDATE grant, and Postgres
-- doesn't surface that as an error inside a function call the way a
-- top-level UPDATE would via PostgREST. Every migration in this project
-- ends with `select public.refresh_recipe_deal_tags();`, run via the SQL
-- editor as a privileged role -- that's what actually computed pricing
-- each time, not any later anon-key verification call.
--
-- SECURITY DEFINER makes it always run with the function owner's
-- privileges, so it works correctly no matter which role calls it.

alter function public.refresh_recipe_deal_tags() security definer;
