-- Anabelle (2026-10-28): "i dont want ot put a max to the deals items i am
-- going to identified as "home"". Drops the 12-pick cap
-- (20261026020000_curated_deals_home_pick_max_twelve.sql); home_pick is
-- still a place, so it starts at 1. Home shows every pick to members,
-- topped up to 12 with the biggest savings.
alter table public.curated_deals drop constraint curated_deals_home_pick_check;

alter table public.curated_deals
  add constraint curated_deals_home_pick_check check (home_pick >= 1);

comment on column public.curated_deals.home_pick is
  'Place on Home''s Top deals grid (1 = first), hand-picked in dev-deals; null = not picked. No cap. Home tops up to 12 with the biggest savings.';
