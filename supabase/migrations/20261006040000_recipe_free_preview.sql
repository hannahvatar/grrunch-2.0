-- Free preview recipes (Anabelle, 2026-10-06: "I will pick each week which
-- 3 of the 12 should be showing in non-member view"). Same live/next pair as
-- featured / featured_next (20260918010000): free_preview_next is picked in
-- dev-recipes' Next week view and publish_week() makes it live. When no
-- recipe is picked, the Meals tab falls back to the first 3 featured.
alter table public.recipes
  add column if not exists free_preview boolean not null default false,
  add column if not exists free_preview_next boolean not null default false;

CREATE OR REPLACE FUNCTION public.publish_week()
 RETURNS TABLE(deals_published integer, deals_still_pending integer, recipes_featured integer, week_from date, week_to date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  update public.recipes set free_preview = free_preview_next where free_preview is distinct from free_preview_next;
  update public.recipes
    set featured_next = false, free_preview_next = false, draft_deal_tags = '[]'::jsonb, draft_price = null
    where featured_next or free_preview_next or draft_price is not null or draft_deal_tags <> '[]'::jsonb;
  select count(*) into recipes_featured from public.recipes where featured;

  perform public.refresh_recipe_deal_tags(true);

  week_from := v_from;
  week_to := v_to;
  return next;
end;
$function$;
