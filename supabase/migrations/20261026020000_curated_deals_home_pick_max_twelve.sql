-- Anabelle (2026-10-26): "i want to be able to showcase 12 deals". Raises
-- the Home picks cap from 6 (20261026010000_curated_deals_home_pick.sql)
-- to 12; Home's Top deals grid shows 12 to members.
alter table public.curated_deals drop constraint curated_deals_home_pick_check;

alter table public.curated_deals
  add constraint curated_deals_home_pick_check check (home_pick between 1 and 12);

comment on column public.curated_deals.home_pick is
  'Place on Home''s Top deals grid (1-12), hand-picked in dev-deals; null = not picked. Unpicked slots fall back to the biggest savings.';
