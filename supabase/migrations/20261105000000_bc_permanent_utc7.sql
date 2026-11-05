-- BC stopped changing its clocks in 2026: it stayed on UTC-7 when it
-- would have fallen back on Nov 1. Supabase's Postgres time-zone data
-- still has Vancouver going to UTC-8, so 'America/Vancouver' put the
-- Thursday 12:00 pm go-live at 1:00 pm real BC time and the Wednesday
-- 11:59 pm close at 12:59 am (Anabelle, 2026-11-05, dev-deals showed
-- "Scheduled to go live Thu, Nov 5, 1:00 p.m.").
--
-- Both calendar helpers now use a fixed UTC-7 instead of the zone name.
-- AT TIME ZONE with an interval uses the ISO sign (-07:00 = UTC-7).
-- publish_week(), schedule_publish_week() and the pg_cron job call these
-- as-is. Same fix in the app (app/lib/bcTime.ts) and the flyer fetch
-- (scripts/weekly_flyer_fetch.py).

-- The first Wednesday 11:59 pm (BC) strictly after p_ts.
create or replace function public.week_close_after(p_ts timestamptz)
returns timestamptz
language plpgsql
stable
as $$
declare
  v_local_date date := (p_ts at time zone interval '-07:00')::date;
  v_close timestamptz;
begin
  -- isodow: Monday = 1 ... Wednesday = 3 ... Sunday = 7.
  v_close := ((v_local_date + ((3 - extract(isodow from v_local_date)::int + 7) % 7))::timestamp
              + time '23:59') at time zone interval '-07:00';
  if v_close <= p_ts then
    v_close := ((v_local_date + ((3 - extract(isodow from v_local_date)::int + 7) % 7) + 7)::timestamp
                + time '23:59') at time zone interval '-07:00';
  end if;
  return v_close;
end;
$$;

-- Thursday 12:00 pm (BC) following a Wednesday 11:59 pm close.
create or replace function public.week_open_after_close(p_close timestamptz)
returns timestamptz
language sql
stable
as $$
  select (((p_close at time zone interval '-07:00')::date + 1)::timestamp + time '12:00') at time zone interval '-07:00';
$$;

-- No re-base here: this week's pending schedule was already moved to
-- 19:00 UTC by hand on 2026-11-05, and the next publish sets a fresh
-- closes_at with the new rule.
