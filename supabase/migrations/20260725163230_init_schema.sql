-- Grrunch initial schema — architecture.md section 3.2 (Data Model sketch).
-- Tables: stores, curated_deals, staple_reference_prices, household_members,
-- meal_plans, saved_recipes, sessions, users.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- stores
-- Populated via Google Places API (server-side; see architecture.md 3.1).
-- ---------------------------------------------------------------------------
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  chain_name text not null,
  banner text,
  address text not null,
  lat double precision,
  lng double precision,
  hours jsonb,
  created_at timestamptz not null default now()
);

comment on table public.stores is 'MVP chains: Save-On-Foods, Real Canadian Superstore/No Frills, Safeway, T&T Supermarket, Walmart.';

-- ---------------------------------------------------------------------------
-- curated_deals
-- Human-reviewed via the Admin Review Tool (Airtable) then published here.
-- Primary ingredient/pricing pool for meal generation and the landing page.
-- ---------------------------------------------------------------------------
create type public.deal_status as enum ('pending', 'approved', 'rejected');

create table public.curated_deals (
  id uuid primary key default gen_random_uuid(),
  chain_name text not null,
  item_name text not null,
  category text,
  price numeric(10, 2) not null check (price >= 0),
  original_price numeric(10, 2) not null check (original_price >= 0),
  -- Powers the landing page's Best Deals (>=40%) / Worth It (15-39%) thresholds
  -- and the savings-evidence feature (section 2.5) — always derived from
  -- price/original_price, never entered separately.
  discount_pct numeric(5, 2) generated always as (
    case
      when original_price > 0 then round(((original_price - price) / original_price) * 100, 2)
      else 0
    end
  ) stored,
  product_url text not null,
  flyer_valid_from date not null,
  flyer_valid_to date not null,
  image_url text,
  status public.deal_status not null default 'pending',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index curated_deals_status_idx on public.curated_deals (status);
create index curated_deals_chain_name_idx on public.curated_deals (chain_name);
create index curated_deals_flyer_valid_to_idx on public.curated_deals (flyer_valid_to);

comment on column public.curated_deals.original_price is 'Regular pre-discount price — required (not optional) so discount_pct and savings claims stay real, not modeled.';

-- ---------------------------------------------------------------------------
-- staple_reference_prices
-- Small maintained list of structurally cheap staples used as meal bases.
-- ---------------------------------------------------------------------------
create type public.staple_category as enum ('base_staple', 'rounding_out_extra');

create table public.staple_reference_prices (
  id uuid primary key default gen_random_uuid(),
  ingredient_name text not null,
  category public.staple_category not null,
  avg_price numeric(10, 2) not null check (avg_price >= 0),
  unit text not null,
  last_checked_at timestamptz not null default now(),
  checked_by text
);

-- ---------------------------------------------------------------------------
-- sessions
-- Anonymous, created on first app open (Step 0 consent, section 2.2).
-- id is the Supabase Anonymous Auth user's id (see enable_anonymous_sign_ins
-- in config.toml), not a freestanding uuid — that gives every session a real
-- auth.uid() from first launch, so RLS can scope rows without a signup wall.
-- When the user creates an account, that auth identity is upgraded in place
-- (supabase.auth.updateUser / linkIdentity), so linked_user_id below just
-- records the users row once it exists.
-- ---------------------------------------------------------------------------
create table public.sessions (
  id uuid primary key references auth.users (id) on delete cascade,
  agreed_to_terms_at timestamptz,
  terms_version text,
  linked_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- users
-- Profile row extending auth.users; created only when the user saves
-- something (a recipe, a plan, or persists their setup) — see section 2.2/2.3.
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  agreed_to_terms_at timestamptz,
  terms_version text,
  notification_prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.users is 'saved_plans[]/saved_recipes[] from the architecture.md sketch are represented via the FK columns on meal_plans.user_id / saved_recipes.user_id below rather than redundant id arrays here, to avoid array/FK drift.';

-- ---------------------------------------------------------------------------
-- meal_plans
-- Per user session/generation — not a fixed library.
-- ---------------------------------------------------------------------------
create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  session_id uuid references public.sessions (id) on delete set null,
  store_ids uuid[] not null default '{}',
  -- Computed union of each household member's exclusions; applied to meal generation.
  combined_exclusions text[] not null default '{}',
  cost_diversity_slider smallint not null default 3 check (cost_diversity_slider between 1 and 10),
  generated_meals jsonb,
  projected_total_price numeric(10, 2),
  projected_price_per_meal numeric(10, 2),
  -- Same grocery list priced at each item's original_price instead of sale
  -- price — sourced from curated_deals, not modeled (section 2.5).
  estimated_baseline_price numeric(10, 2),
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint meal_plans_owner_check check (user_id is not null or session_id is not null)
);

create index meal_plans_user_id_idx on public.meal_plans (user_id);
create index meal_plans_session_id_idx on public.meal_plans (session_id);

-- ---------------------------------------------------------------------------
-- household_members
-- One or more per meal plan — supports mixed households.
-- ---------------------------------------------------------------------------
create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references public.meal_plans (id) on delete cascade,
  label text not null,
  target_calories integer check (target_calories >= 0),
  target_macros jsonb,
  exclusions text[] not null default '{}'
);

create index household_members_meal_plan_id_idx on public.household_members (meal_plan_id);

-- ---------------------------------------------------------------------------
-- saved_recipes
-- Static snapshot — not linked to curated_deals or product_url.
-- ---------------------------------------------------------------------------
create table public.saved_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  ingredients jsonb not null,
  macros jsonb,
  calories integer check (calories >= 0),
  saved_at timestamptz not null default now()
);

create index saved_recipes_user_id_idx on public.saved_recipes (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.stores enable row level security;
alter table public.curated_deals enable row level security;
alter table public.staple_reference_prices enable row level security;
alter table public.sessions enable row level security;
alter table public.users enable row level security;
alter table public.meal_plans enable row level security;
alter table public.household_members enable row level security;
alter table public.saved_recipes enable row level security;

-- Public, read-only reference data — no login required (landing page, deal browse).
create policy "stores are publicly readable" on public.stores
  for select using (true);

create policy "approved curated_deals are publicly readable" on public.curated_deals
  for select using (status = 'approved');

create policy "staple_reference_prices are publicly readable" on public.staple_reference_prices
  for select using (true);

-- Sessions: anonymous-first, no login required for Step 0 consent — but each
-- anonymous auth user (auth.uid()) can only see/manage their own session row.
create policy "a session can be created for its own auth user" on public.sessions
  for insert with check (auth.uid() = id);

create policy "a user can read their own session" on public.sessions
  for select using (auth.uid() = id);

create policy "a user can update their own session" on public.sessions
  for update using (auth.uid() = id);

-- Users: only the authenticated owner can see/manage their own profile.
create policy "users can view their own profile" on public.users
  for select using (auth.uid() = id);

create policy "users can update their own profile" on public.users
  for update using (auth.uid() = id);

create policy "users can insert their own profile" on public.users
  for insert with check (auth.uid() = id);

-- meal_plans: owned by the authenticated user, or by the anonymous auth user
-- that created it via session_id (see sessions above — both cases resolve to
-- a real auth.uid(), so this never falls open to "any anonymous caller").
create policy "owners can manage their meal plans" on public.meal_plans
  for all using (auth.uid() = user_id or auth.uid() = session_id)
  with check (auth.uid() = user_id or auth.uid() = session_id);

create policy "household members follow their meal plan" on public.household_members
  for all using (
    exists (
      select 1 from public.meal_plans
      where meal_plans.id = household_members.meal_plan_id
        and (meal_plans.user_id = auth.uid() or meal_plans.session_id = auth.uid())
    )
  );

-- saved_recipes: only the authenticated owner (saving requires an account).
create policy "users can manage their own saved recipes" on public.saved_recipes
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
