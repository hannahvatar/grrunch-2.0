-- 30 days of full access from sign-up, no card (Anabelle, 2026-11-02:
-- landing on a locked app and having to start a trial caused drop-off).
-- The start-free-month Edge Function grants it as a RevenueCat promotional
-- entitlement and records it here, one row per account, so nobody gets a
-- second free month. Only that function (service role) reads or writes
-- this table: RLS on, no policies.
create table public.free_months (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  ends_at timestamptz
);

alter table public.free_months enable row level security;
