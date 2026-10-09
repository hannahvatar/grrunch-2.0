-- Publishing re-matches every recipe against the new week
-- (refresh_recipe_deal_tags), which no longer fits the default API
-- statement timeout: "Publish week" in dev-deals failed on 2026-10-09
-- with "canceling statement due to statement timeout". Give the publish
-- entry points the same headroom refresh_recipe_deal_tags already has
-- (20261002010000).
alter function public.publish_week() set statement_timeout = '120s';
alter function public.schedule_publish_week() set statement_timeout = '120s';
alter function public.run_scheduled_publish() set statement_timeout = '120s';
