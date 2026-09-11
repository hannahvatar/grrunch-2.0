-- Real gap, found live (Anabelle, 2026-09-11): Meals had no concept of
-- "this week's 12 recipes" at all -- it showed every recipe with an
-- active deal tag, full stop, no cap. Checked live: 38 of 41 recipes
-- currently qualify, nowhere near the intended weekly count.
--
-- `featured` is a plain boolean, not a week_of date -- Anabelle's own
-- workflow is "toggle this week's 12 on, toggle last week's off" via
-- dev-recipes.tsx, the same review screen she already uses; there's no
-- need to keep a full history of which recipes were featured which
-- week for that. Meals.tsx now filters on this instead of dealTags.
-- length > 0 -- a featured recipe can be pulled from the existing
-- database (has a real deal tag, the common case) or a custom one built
-- just for this week (no deal tag at all) -- either way, `featured` is
-- now the one real gate, matching "pulled from our recipe database or
-- custom for that specific week or a bit of both".
alter table public.recipes add column featured boolean not null default false;

comment on column public.recipes.featured is
  'Manually toggled by Anabelle (dev-recipes.tsx) -- true for this week''s featured set (intended: 12 recipes). Replaces the old "show every recipe with an active deal" rule on the Meals tab. Not a week_of date: no history is kept, she just re-toggles it each week.';
