-- Real, government-sourced reference prices for ~35-40 common grocery
-- staples, from Statistics Canada's "Monthly average retail prices for
-- selected products" (table 18-10-0245-01), British Columbia only,
-- refreshed monthly via StatCan's free, open Web Data Service API --
-- https://www150.statcan.gc.ca/t1/wds/rest/getFullTableDownloadCSV.
--
-- Deliberately a SEPARATE table from staple_reference_prices (the
-- earlier AI-guessed fallback list): this one's numbers are sourced and
-- traceable, that one's aren't. Matching should check this table first
-- and only fall back to staple_reference_prices for ingredients StatCan
-- doesn't track (most specialty/ethnic ingredients Grrunch's recipes
-- actually use -- kabobs, ramen, wontons, kolbassa, etc. -- StatCan only
-- covers ~110 generic staples, not those).
create table public.statcan_reference_prices (
  id uuid primary key default gen_random_uuid(),
  -- Raw StatCan product label, e.g. "Milk, 2 litres" -- kept verbatim
  -- for traceability back to the source table.
  product_name text not null,
  -- Everything before the first comma in product_name, e.g. "Milk" --
  -- what the app's word-subset matching (see lib/staplePrices.ts)
  -- actually matches recipe ingredients against.
  ingredient_name text not null,
  unit text not null,
  avg_price numeric(10, 2) not null check (avg_price >= 0),
  geography text not null default 'British Columbia',
  -- The month this price reflects (StatCan's REF_DATE), not when we
  -- synced it -- lets us tell "this number is from 3 months ago" apart
  -- from "we haven't synced in 3 months".
  reference_month date not null,
  source text not null default 'statcan',
  last_synced_at timestamptz not null default now(),
  unique (product_name, geography)
);

alter table public.statcan_reference_prices enable row level security;

create policy "statcan_reference_prices are publicly readable" on public.statcan_reference_prices
  for select using (true);

comment on table public.statcan_reference_prices is
  'Real BC retail prices from StatCan table 18-10-0245-01, synced monthly via scripts/sync_statcan_prices.py. Checked before staple_reference_prices (the AI-guessed fallback) when estimating a non-deal ingredient''s cost.';
