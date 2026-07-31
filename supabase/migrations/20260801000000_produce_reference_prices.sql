-- Manually-sourced reference prices for fresh produce items that go on
-- sale but have no regular-price baseline anywhere else (StatCan's
-- ~110-item table doesn't track most produce -- e.g. blueberries).
--
-- Deliberately a SEPARATE table from both statcan_reference_prices (real,
-- but doesn't cover produce) and staple_reference_prices (AI-guessed,
-- not something we want mixed with human-verified numbers): this table
-- holds only prices a human actually looked up and entered, one item at
-- a time, via the "Produce Reference Gaps" Airtable table -- populated by
-- scripts/sync_weekly_deals.py whenever a produce deal has no reference
-- price yet, and pulled back in once filled.
create table public.produce_reference_prices (
  id uuid primary key default gen_random_uuid(),
  ingredient_name text not null,
  unit text not null,
  avg_price numeric(10, 2) not null check (avg_price >= 0),
  geography text not null default 'British Columbia',
  -- The date the reference price was actually looked up (e.g. from
  -- grocerytracker.ca), not when it was synced into Supabase.
  reference_date date not null,
  source text not null default 'manual',
  -- Ties back to the originating "Produce Reference Gaps" Airtable row,
  -- used as the upsert key so a re-sync updates rather than duplicates.
  airtable_record_id text unique,
  last_synced_at timestamptz not null default now(),
  unique (ingredient_name, geography)
);

alter table public.produce_reference_prices enable row level security;

create policy "produce_reference_prices are publicly readable" on public.produce_reference_prices
  for select using (true);

comment on table public.produce_reference_prices is
  'Human-sourced BC produce reference prices, filled in via the "Produce Reference Gaps" Airtable table and synced by scripts/sync_weekly_deals.py. Checked after statcan_reference_prices and before staple_reference_prices when estimating a non-deal ingredient''s cost.';
