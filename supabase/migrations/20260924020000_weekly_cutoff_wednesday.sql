-- Revised weekly rhythm (Anabelle, 2026-09-24, same day as
-- 20260924010000_weekly_cutoff_schedule.sql), Vancouver time:
--   - New flyers are visible on Flipp Tue 9:00 pm (No Frills, Real
--     Canadian Superstore) and Wed 12:00 am (Save-On-Foods, Safeway,
--     Walmart) -- a full Wednesday to review before they're valid.
--   - The live week CLOSES Wednesday 11:59 pm, when its flyers end.
--   - Empty state Thursday 12:00 am to 12:00 pm.
--   - The new week goes live Thursday 12:00 pm (scheduled publish).
-- "From 48 hours to half a day of cutoff period."
--
-- Only the two calendar helpers change; publish_week(),
-- schedule_publish_week() and the pg_cron job use them as-is.

-- The first Wednesday 11:59 pm (Vancouver) strictly after p_ts.
create or replace function public.week_close_after(p_ts timestamptz)
returns timestamptz
language plpgsql
stable
as $$
declare
  v_local_date date := (p_ts at time zone 'America/Vancouver')::date;
  v_close timestamptz;
begin
  -- isodow: Monday = 1 ... Wednesday = 3 ... Sunday = 7.
  v_close := ((v_local_date + ((3 - extract(isodow from v_local_date)::int + 7) % 7))::timestamp
              + time '23:59') at time zone 'America/Vancouver';
  if v_close <= p_ts then
    v_close := ((v_local_date + ((3 - extract(isodow from v_local_date)::int + 7) % 7) + 7)::timestamp
                + time '23:59') at time zone 'America/Vancouver';
  end if;
  return v_close;
end;
$$;

-- Thursday 12:00 pm (Vancouver) following a Wednesday 11:59 pm close.
create or replace function public.week_open_after_close(p_close timestamptz)
returns timestamptz
language sql
stable
as $$
  select (((p_close at time zone 'America/Vancouver')::date + 1)::timestamp + time '12:00') at time zone 'America/Vancouver';
$$;

-- Re-base the live week on the new close day (it was set to the old
-- Thursday rule), and any pending schedule on the new go-live time.
update public.published_week set closes_at = public.week_close_after(now()) where id = 1;
update public.published_week
  set scheduled_publish_at = public.week_open_after_close(closes_at)
  where id = 1 and scheduled_publish_at is not null;
