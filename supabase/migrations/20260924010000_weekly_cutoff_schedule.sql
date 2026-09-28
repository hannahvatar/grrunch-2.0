-- Weekly cut-off schedule (Anabelle, 2026-09-24), all in Vancouver time:
--   - Thursday 11:59 pm: the live week closes. The app hides Meals and
--     Weekly Deals, clears the grocery list, and shows a modal to anyone
--     browsing.
--   - Friday: the app shows an empty "new deals are coming" state.
--   - Saturday 12:00 am: the reviewed draft week goes live. Publishing
--     from the dev screen now SCHEDULES the week for that moment instead
--     of going live instantly; a pg_cron job promotes it on time.
--   - If Saturday midnight passes with nothing scheduled, the empty state
--     stays until the week is published (which then goes live at once).
--
-- "Closed" is a display state, not a delete: the live rows stay until the
-- next publish replaces them, same as before. The app reads closes_at
-- from published_week (already publicly readable) to know when to switch.

create extension if not exists pg_cron with schema extensions;

alter table public.published_week
  add column closes_at timestamptz,
  add column scheduled_publish_at timestamptz;

-- The first Thursday 11:59 pm (Vancouver) strictly after p_ts. Computed
-- on the local calendar, so daylight saving is handled by the time zone
-- conversion rather than a fixed UTC offset.
create or replace function public.week_close_after(p_ts timestamptz)
returns timestamptz
language plpgsql
stable
as $$
declare
  v_local_date date := (p_ts at time zone 'America/Vancouver')::date;
  v_close timestamptz;
begin
  -- isodow: Monday = 1 ... Thursday = 4 ... Sunday = 7.
  v_close := ((v_local_date + ((4 - extract(isodow from v_local_date)::int + 7) % 7))::timestamp
              + time '23:59') at time zone 'America/Vancouver';
  if v_close <= p_ts then
    v_close := ((v_local_date + ((4 - extract(isodow from v_local_date)::int + 7) % 7) + 7)::timestamp
                + time '23:59') at time zone 'America/Vancouver';
  end if;
  return v_close;
end;
$$;

-- Saturday 12:00 am (Vancouver) following a Thursday 11:59 pm close.
create or replace function public.week_open_after_close(p_close timestamptz)
returns timestamptz
language sql
stable
as $$
  select (((p_close at time zone 'America/Vancouver')::date + 2)::timestamp) at time zone 'America/Vancouver';
$$;

-- publish_week(): same body as 20260918010000_weekly_publish.sql, plus
-- two published_week fields -- closes_at (the next Thursday 11:59 pm) and
-- clearing any pending schedule, since the week it was for is now live.
create or replace function public.publish_week()
returns table (deals_published int, deals_still_pending int, recipes_featured int, week_from date, week_to date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from date;
  v_to date;
begin
  if not exists (select 1 from public.curated_deals where published = false and status = 'approved') then
    raise exception 'No approved deals in the draft week -- nothing to publish.';
  end if;

  select w.valid_from, w.valid_to into v_from, v_to from public.flyer_week_of(false) w;
  if v_from is null then
    select min(flyer_valid_from), max(flyer_valid_to) into v_from, v_to
    from public.curated_deals where published = false;
  end if;

  select count(*) filter (where status = 'approved'), count(*) filter (where status = 'pending')
    into deals_published, deals_still_pending
  from public.curated_deals where published = false;

  delete from public.curated_deals where published = true;
  update public.curated_deals set published = true where published = false;

  insert into public.published_week (id, flyer_valid_from, flyer_valid_to, published_at, closes_at, scheduled_publish_at)
  values (1, v_from, v_to, now(), public.week_close_after(now()), null)
  on conflict (id) do update
    set flyer_valid_from = excluded.flyer_valid_from,
        flyer_valid_to = excluded.flyer_valid_to,
        published_at = excluded.published_at,
        closes_at = excluded.closes_at,
        scheduled_publish_at = null;

  update public.recipes set featured = featured_next where featured is distinct from featured_next;
  update public.recipes
    set featured_next = false, draft_deal_tags = '[]'::jsonb, draft_price = null
    where featured_next or draft_price is not null or draft_deal_tags <> '[]'::jsonb;
  select count(*) into recipes_featured from public.recipes where featured;

  perform public.refresh_recipe_deal_tags(true);

  week_from := v_from;
  week_to := v_to;
  return next;
end;
$$;

-- What the dev screen's Publish button now calls. Schedules the draft
-- for the Saturday 12:00 am that follows the live week's close; if that
-- moment has already passed (publishing late, during the empty state),
-- publishes right away instead.
create or replace function public.schedule_publish_week()
returns table (published_now boolean, scheduled_for timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_close timestamptz;
  v_target timestamptz;
begin
  if not exists (select 1 from public.curated_deals where published = false and status = 'approved') then
    raise exception 'No approved deals in the draft week -- nothing to publish.';
  end if;

  select closes_at into v_close from public.published_week where id = 1;
  -- No close time recorded yet (first run after this migration, or no
  -- live week at all): use the coming Thursday's close.
  v_target := public.week_open_after_close(coalesce(v_close, public.week_close_after(now())));

  if v_target <= now() then
    perform public.publish_week();
    published_now := true;
    scheduled_for := null;
  else
    update public.published_week set scheduled_publish_at = v_target where id = 1;
    published_now := false;
    scheduled_for := v_target;
  end if;
  return next;
end;
$$;

create or replace function public.cancel_scheduled_publish()
returns void
language sql
security definer
set search_path = public
as $$
  update public.published_week set scheduled_publish_at = null where id = 1;
$$;

-- Run by pg_cron every 5 minutes: promotes the scheduled week once its
-- time has come. A no-op the rest of the week.
create or replace function public.run_scheduled_publish()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.published_week
    where id = 1 and scheduled_publish_at is not null and scheduled_publish_at <= now()
  ) then
    perform public.publish_week();
  end if;
end;
$$;

revoke execute on function public.schedule_publish_week() from public, anon, authenticated;
revoke execute on function public.cancel_scheduled_publish() from public, anon, authenticated;
revoke execute on function public.run_scheduled_publish() from public, anon, authenticated;
grant execute on function public.schedule_publish_week() to service_role;
grant execute on function public.cancel_scheduled_publish() to service_role;
grant execute on function public.run_scheduled_publish() to service_role;

-- Backfill the live week's close from when it was published.
update public.published_week set closes_at = public.week_close_after(published_at) where id = 1 and closes_at is null;

select cron.schedule('run-scheduled-publish', '*/5 * * * *', $$select public.run_scheduled_publish()$$);
