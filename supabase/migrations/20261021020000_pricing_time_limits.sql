-- Re-pricing every recipe (refresh_recipe_deal_tags) now takes about a
-- minute as the library grows (2026-10-21), right at its 60 s limit; the
-- weekly fetch's call to it already timed out client-side. Publishing
-- re-prices too, under a 120 s limit. Raise all of them to 5 minutes so a
-- slow run finishes instead of failing. Only the setting changes; the
-- function bodies are untouched (and keep their own SET statement_timeout,
-- see 20261009010000_publish_timeout.sql).
alter function public.refresh_recipe_deal_tags(boolean) set statement_timeout = '300s';
alter function public.publish_week() set statement_timeout = '300s';
alter function public.schedule_publish_week() set statement_timeout = '300s';
alter function public.run_scheduled_publish() set statement_timeout = '300s';
