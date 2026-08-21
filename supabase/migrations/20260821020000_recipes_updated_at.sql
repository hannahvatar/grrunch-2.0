-- dev-recipes.tsx already sorts newest-first (Anabelle: "reoder (just
-- on this page) per newest first so its easier for me to review
-- recipes"), but it sorts by created_at -- which never moves once a
-- recipe is edited. Sticky Fingers Chicken (created 2026-08-19 as the
-- old "Braised Drumsticks with Basmati Rice", then completely rewritten
-- today) still sorts by that stale creation date, not by when it was
-- actually last worked on -- the opposite of what makes this review
-- screen useful. Real gap, caught live: Anabelle, on the Meals tab's
-- unrelated sort options: "make sure the recipes show the newest
-- first" -> "I meant just for the dev-recipes view".
--
-- Standard auto-maintained updated_at pattern: a trigger bumps it to
-- now() on every UPDATE, so no application code has to remember to set
-- it. Backfilled to created_at for every existing row -- the only value
-- that doesn't invent a fake edit history for recipes that haven't
-- actually been touched since creation.
alter table public.recipes
  add column updated_at timestamptz not null default now();

update public.recipes set updated_at = created_at;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Generic BEFORE UPDATE trigger function: stamps NEW.updated_at to now() on every row update. Reusable by any table with an updated_at column, not recipes-specific.';

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row
  execute function public.set_updated_at();

comment on column public.recipes.updated_at is
  'Auto-maintained by the recipes_set_updated_at trigger -- always the timestamp of the row''s last UPDATE (or created_at if never edited since creation). Used by dev-recipes.tsx to sort newest-worked-on-first, distinct from created_at which never changes after insert.';
