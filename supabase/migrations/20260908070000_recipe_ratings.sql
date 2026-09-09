-- 5-star recipe ratings (Anabelle, 2026-09-08): "Unsubscribers can see
-- the vote, but can't vote." Two parts to that:
--   1. The aggregate (avg_rating/rating_count on recipes itself) is
--      publicly readable, same as the rest of the recipe -- everyone,
--      guest included, sees the vote.
--   2. Casting a vote requires an active/trialing subscription, enforced
--      here in RLS (not just the client's own isSubscribed check) --
--      the same reasoning as subscriptions.sql's own row-level policies:
--      a non-subscriber calling this table directly with the anon key
--      must fail server-side, not just be discouraged by the UI.
create table public.recipe_ratings (
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  -- One rating per person per recipe -- rating again updates it (a
  -- typical star-rating UX), not a new row each time.
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create index recipe_ratings_recipe_id_idx on public.recipe_ratings (recipe_id);

create trigger recipe_ratings_set_updated_at
  before update on public.recipe_ratings
  for each row
  execute function public.set_updated_at();

alter table public.recipe_ratings enable row level security;

-- Ratings are public data (they're what the aggregate is built from),
-- same openness as "recipes are publicly readable" -- no reason a
-- guest's read access should stop at the average when the per-rating
-- rows aren't sensitive.
create policy "recipe ratings are publicly readable" on public.recipe_ratings
  for select using (true);

-- exists(...) against subscriptions is the actual enforcement of "can't
-- vote" -- trialing counts same as active (matches useSubscription's own
-- isSubscribed definition), a subscription that's merely `expired` (or
-- absent entirely, i.e. a guest or free account) does not.
create policy "subscribers can rate recipes" on public.recipe_ratings
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.subscriptions
      where user_id = auth.uid() and status in ('trialing', 'active')
    )
  );

create policy "subscribers can update their own rating" on public.recipe_ratings
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.subscriptions
      where user_id = auth.uid() and status in ('trialing', 'active')
    )
  );

create policy "subscribers can delete their own rating" on public.recipe_ratings
  for delete using (
    auth.uid() = user_id
    and exists (
      select 1 from public.subscriptions
      where user_id = auth.uid() and status in ('trialing', 'active')
    )
  );

-- Materialized on recipes itself (same reasoning as deal_tags/nutrition's
-- own refresh_recipe_*() functions elsewhere in this schema) -- every
-- recipe fetch reads this, so it's a plain column instead of a join +
-- aggregate query on every single fetchAllRecipes()/fetchRecipeById()
-- call. avg_rating is null (not 0) until the first rating exists, so the
-- client can tell "no ratings yet" apart from "rated exactly 0" (which
-- can't happen -- rating is 1-5 -- but null-vs-zero is the same
-- distinction reference pricing elsewhere in this schema already relies
-- on, so it's kept consistent here too).
alter table public.recipes add column avg_rating numeric(2, 1);
alter table public.recipes add column rating_count integer not null default 0;

create or replace function public.refresh_recipe_rating(target_recipe_id uuid)
returns void
language plpgsql
as $$
begin
  update public.recipes
  set avg_rating = (
        select round(avg(rating)::numeric, 1)
        from public.recipe_ratings
        where recipe_id = target_recipe_id
      ),
      rating_count = (
        select count(*) from public.recipe_ratings where recipe_id = target_recipe_id
      )
  where id = target_recipe_id;
end;
$$;

comment on function public.refresh_recipe_rating(uuid) is
  'Recomputes one recipe''s avg_rating/rating_count from recipe_ratings. Called by recipe_ratings_refresh_aggregate below on every insert/update/delete; also safe to call by hand for a one-off backfill.';

create or replace function public.recipe_ratings_refresh_aggregate()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    perform public.refresh_recipe_rating(old.recipe_id);
    return old;
  end if;
  perform public.refresh_recipe_rating(new.recipe_id);
  return new;
end;
$$;

create trigger recipe_ratings_refresh_aggregate
  after insert or update or delete on public.recipe_ratings
  for each row
  execute function public.recipe_ratings_refresh_aggregate();
