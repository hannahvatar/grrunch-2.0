-- Weekly "new deals are live" email (Anabelle, 2026-11-03: remind
-- sign-ups every Thursday so they don't forget about Grrunch). Sent by
-- the send-weekly-email Edge Function right after the week goes live.
--
-- Consent (CASL): the sign-up box starts unticked, and ticking it (or
-- turning on Profile > Notifications > Email > Recommendations) is what
-- records weekly_deals = true and consented_at. Accounts made before this
-- launched never saw the box, so they get ONE email with a "Keep them
-- coming" button (asked_at records it) and nothing after unless they
-- click it. Unsubscribing sets weekly_deals = false.
create table public.email_consents (
  user_id uuid primary key references auth.users (id) on delete cascade,
  weekly_deals boolean not null default false,
  consented_at timestamptz,
  -- 'signup', 'profile' or 'email' (the Keep them coming button).
  source text,
  asked_at timestamptz,
  unsubscribed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.email_consents enable row level security;

-- A signed-in user reads and sets their own consent only (the sign-up
-- box and the Profile switch write it from the app).
create policy "users read their own email consent"
  on public.email_consents for select
  to authenticated
  using (user_id = auth.uid());

create policy "users add their own email consent"
  on public.email_consents for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users change their own email consent"
  on public.email_consents for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- One row per week emailed, so the email goes out once per week no matter
-- how often the function runs. Service role only.
create table public.weekly_email_sends (
  flyer_valid_from date primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  sent_count integer not null default 0,
  error text
);

alter table public.weekly_email_sends enable row level security;

-- Every 10 minutes. The function does nothing unless a week went live in
-- the last 6 hours and hasn't been emailed yet, so calling it is
-- harmless (same reasoning as sync-statcan-prices-monthly).
select cron.schedule(
  'send-weekly-email',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://vzuugbiqbzritdystnar.supabase.co/functions/v1/send-weekly-email',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
