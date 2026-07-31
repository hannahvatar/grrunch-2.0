-- Schedules the sync-statcan-prices Edge Function to run monthly, entirely
-- within Supabase -- no external cloud agent, no credential stored outside
-- Supabase's own environment. The function itself is deployed with JWT
-- verification off (see deployment notes in supabase/functions/sync-statcan-prices),
-- since the only thing an unauthorized call could do is trigger an early
-- re-sync of public StatCan data -- not access or leak anything.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- StatCan releases new data for table 18-10-0245-01 a couple of days into
-- the following month -- 5th, 8am UTC gives a comfortable buffer.
select cron.schedule(
  'sync-statcan-prices-monthly',
  '0 8 5 * *',
  $$
  select net.http_post(
    url := 'https://vzuugbiqbzritdystnar.supabase.co/functions/v1/sync-statcan-prices',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);
