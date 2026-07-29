-- recipes
-- Persistent recipe library — supersedes the original MVP decision of
-- generating every meal from scratch per session (architecture.md 2.6, 3.1).
-- Populated by AI generation from curated_deals rows tagged 'recipes' or
-- 'both' in the Airtable Admin Review Tool, plus manual curator entry.
-- Ingredients are plain text, deliberately decoupled from any specific
-- week's deal — deals rotate weekly, recipes are meant to be reusable.
create type public.recipe_source as enum ('ai_generated', 'manual');

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- [{name, quantity, unit}, ...] — plain text, no live price/deal link
  ingredients jsonb not null,
  -- ["step one", "step two", ...] — ordered instructions
  instructions jsonb not null,
  tag text,
  calories numeric(6, 0) check (calories >= 0),
  protein numeric(6, 1) check (protein >= 0),
  minutes numeric(5, 0) check (minutes >= 0),
  -- Estimated price per serving at time of generation — a snapshot, not
  -- re-priced live (same philosophy as saved_recipes.price).
  price numeric(10, 2) check (price >= 0),
  source public.recipe_source not null default 'manual',
  -- curated_deals rows this recipe was inspired by, for traceability only —
  -- not a live FK-enforced link, since curated_deals rotates weekly and a
  -- recipe should stay valid after its source deal expires.
  source_deal_ids uuid[],
  created_at timestamptz not null default now()
);

create index recipes_source_idx on public.recipes (source);

alter table public.recipes enable row level security;

create policy "recipes are publicly readable" on public.recipes
  for select using (true);
