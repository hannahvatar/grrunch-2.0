-- Anabelle (2026-10-26): "Like the recipes, i should be able to pick the 3
-- free deals". home_free marks up to 3 of the week's Home picks
-- (home_pick) as free: the deals non-members see on Home, and always
-- unlocked for them on Weekly Deals. Only a picked deal can be free;
-- removing the pick clears it. None marked = the first 3 picks. Set from
-- dev-deals via the set-deal-home-pick Edge Function.
alter table public.curated_deals
  add column home_free boolean not null default false;

alter table public.curated_deals
  add constraint curated_deals_home_free_needs_pick check (not home_free or home_pick is not null);

comment on column public.curated_deals.home_free is
  'One of up to 3 free Home deals for non-members (always a Home pick); also unlocked on Weekly Deals. None = the first 3 picks.';
