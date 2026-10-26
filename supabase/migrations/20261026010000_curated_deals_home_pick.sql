-- Anabelle (2026-10-26): "I also want to hand pick myself which deals
-- should showcase" on Home's Top deals grid. home_pick is the deal's
-- place in that grid (1 = first), null when not picked; at most 6 per
-- week (the grid shows 6). Picks belong to the week's rows, so they go
-- live with the draft on publish and disappear with the week. Empty =
-- Home falls back to the biggest savings. Set from dev-deals via the
-- set-deal-home-pick Edge Function.
alter table public.curated_deals
  add column home_pick smallint check (home_pick between 1 and 6);

comment on column public.curated_deals.home_pick is
  'Place on Home''s Top deals grid (1-6), hand-picked in dev-deals; null = not picked. Unpicked slots fall back to the biggest savings.';
