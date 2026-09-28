-- Why Claude picked a flyer item as a deal candidate (scripts/
-- weekly_flyer_fetch.py, Anabelle 2026-09-24): "Saving on flyer: Reg.
-- $12.99", "Good recipe ingredient", or "AI estimate: looks low". Shown
-- in dev-deals so the reviewer can judge the reason at a glance. Null for
-- rows that didn't come from the automated fetch.
alter table public.curated_deals add column if not exists pick_reason text;
