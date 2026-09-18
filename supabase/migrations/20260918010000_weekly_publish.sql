-- Weekly staging + "Publish week" (Anabelle, 2026-09-18).
--
-- Before this, curated_deals held one week only: the weekly sync wiped
-- every row and reloaded the new week as 'pending', so shoppers' Weekly
-- Deals went empty the moment the sync ran, and each approval in
-- dev-deals.tsx went live (and re-priced recipes) the instant it was
-- saved. Her target flow: review ~200 deals and build 12 recipes as a
-- DRAFT, then publish everything together in one step -- by hand for
-- now, automatic later. Meanwhile shoppers keep last week's deals,
-- marked expired, with a "fresh deals are on the way" message (app side).
--
-- Model: a LIVE week and a DRAFT week side by side in curated_deals,
-- told apart by `published`.
--   - curated_deals.published: true = the live week shoppers see.
--   - RLS: shoppers see only approved AND published rows.
--   - recipes.featured stays the live set; featured_next is the set being
--     built for the draft week, priced against draft deals via
--     draft_deal_tags / draft_price.
--   - published_week: one row holding the live week's flyer dates, so
--     the app can tell when it has expired without reading every deal.
--   - publish_week(): swaps the draft in as the new live week, atomically.
--
-- Backfill: every existing row is the current live week (2026-08-13).

alter table public.curated_deals
  add column published boolean not null default false;

update public.curated_deals set published = true;

create index curated_deals_published_idx on public.curated_deals (published);

drop policy "approved curated_deals are publicly readable" on public.curated_deals;
create policy "approved published curated_deals are publicly readable" on public.curated_deals
  for select using (status = 'approved' and published);

alter table public.recipes
  add column draft_deal_tags jsonb not null default '[]'::jsonb,
  add column draft_price numeric,
  add column featured_next boolean not null default false;

-- One row, id always 1. flyer_valid_to is the week's own end date as
-- printed on the flyers -- the app treats the week as expired from the
-- next day (BC time), whatever weekday or hour stores actually publish.
create table public.published_week (
  id smallint primary key default 1 check (id = 1),
  flyer_valid_from date not null,
  flyer_valid_to date not null,
  published_at timestamptz not null default now()
);

alter table public.published_week enable row level security;
create policy "published_week is publicly readable" on public.published_week
  for select using (true);

-- The live week's dates: the most common range among flyer-path rows
-- (product_url <> '' -- produce-gap rows carry their own today+6 dates),
-- so a handful of longer multi-week offers don't mask the week's real end.
create or replace function public.flyer_week_of(p_published boolean)
returns table (valid_from date, valid_to date)
language sql
stable
as $$
  select flyer_valid_from, flyer_valid_to
  from public.curated_deals
  where published = p_published and product_url <> ''
  group by flyer_valid_from, flyer_valid_to
  order by count(*) desc, flyer_valid_to desc
  limit 1;
$$;

insert into public.published_week (id, flyer_valid_from, flyer_valid_to, published_at)
select 1, w.valid_from, w.valid_to, now() from public.flyer_week_of(true) w;

-- refresh_recipe_deal_tags(p_published): same body as
-- 20260914020000_deal_tags_tiebreak_lowest_price.sql, three mechanical
-- changes only:
--   1. deal_cache also filters published = p_published;
--   2. writes deal_tags/price (live) or draft_deal_tags/draft_price
--      (draft) depending on p_published;
--   3. the used_in_recipe reset/set only touch rows in that same set.
-- The zero-argument form is dropped first -- keeping it next to a
-- one-argument version with a default would make refresh_recipe_deal_tags()
-- ambiguous. Existing zero-argument callers get the live week, as before.
drop function public.refresh_recipe_deal_tags();

create or replace function public.refresh_recipe_deal_tags(p_published boolean default true)
returns void
language plpgsql
as $$
declare
  rec record;
  ing jsonb;
  deal record;
  best_deal record;
  best_deal_words int;
  staple record;
  new_tags jsonb;
  ing_words text[];
  alias_ing_words text[];
  keyword text;
  keyword_words text[];
  best_keyword_words int;
  matched boolean;
  total numeric;
  best_staple_price numeric;
  best_staple_unit text;
  best_staple_words int;
  scaled numeric;
  tag_price numeric;
  tag_original_price numeric;
  tag_estimated boolean;
  tag_price_estimated boolean;
  tag_contribution numeric;
  new_price numeric;
  matched_deal_ids uuid[] := '{}';
begin
  drop table if exists deal_cache;
  drop table if exists staple_cache;

  create temp table deal_cache on commit drop as
  select id, item_name, chain_name, image_url, price, original_price, product_url,
         price_unit, package_weight_g, package_weight_g_source, fragment_by_weight,
         quantity_estimated, original_price_source, bundle_count, package_volume_ml,
         keyword_matches,
         public.normalize_words(item_name) as deal_words
  from public.curated_deals
  where status = 'approved' and usage <> 'deals' and published = p_published;

  create temp table staple_cache on commit drop as
  select 1 as tier_rank, ingredient_name, avg_price, unit,
         public.staple_alias_words(public.normalize_words(ingredient_name)) as staple_words
  from public.statcan_reference_prices
  union all
  select 2 as tier_rank, ingredient_name, avg_price, unit,
         public.staple_alias_words(public.normalize_words(ingredient_name)) as staple_words
  from public.produce_reference_prices
  union all
  select 3 as tier_rank, ingredient_name, avg_price, unit,
         public.staple_alias_words(public.normalize_words(ingredient_name)) as staple_words
  from public.staple_reference_prices
  where checked_by <> 'ai_estimated';

  update public.curated_deals set used_in_recipe = false
    where used_in_recipe = true and published = p_published;

  for rec in select id, ingredients, servings from public.recipes loop
    new_tags := '[]'::jsonb;
    total := 0;

    for ing in select value from jsonb_array_elements(rec.ingredients) loop
      ing_words := public.normalize_words(ing->>'name');
      matched := false;
      best_deal_words := 0;

      for deal in select * from deal_cache loop
        if array_length(deal.deal_words, 1) > 0 and deal.deal_words <@ ing_words then
          if array_length(deal.deal_words, 1) > best_deal_words then
            best_deal := deal;
            best_deal_words := array_length(deal.deal_words, 1);
          -- Tie-break: equal specificity, lower price wins. A genuine
          -- elsif, not an OR in the if above -- see 20260914020000.
          elsif best_deal_words > 0 and array_length(deal.deal_words, 1) = best_deal_words and deal.price < best_deal.price then
            best_deal := deal;
          end if;
        end if;
      end loop;

      if best_deal_words > 0 then
        select p.tag_price, p.tag_original_price, p.tag_quantity_estimated, p.tag_price_estimated, p.tag_contribution
          into tag_price, tag_original_price, tag_estimated, tag_price_estimated, tag_contribution
        from public.compute_deal_tag_pricing(
          best_deal.price, best_deal.original_price, best_deal.price_unit, best_deal.package_weight_g,
          best_deal.package_weight_g_source, best_deal.fragment_by_weight, best_deal.quantity_estimated,
          ing->>'quantity', ing->>'unit', ing->>'name',
          best_deal.bundle_count, best_deal.package_volume_ml
        ) p;

        if tag_price is not null then
          matched := true;
          matched_deal_ids := array_append(matched_deal_ids, best_deal.id);
          new_tags := new_tags || jsonb_build_object(
            'name', ing->>'name',
            'store', best_deal.chain_name,
            'image_url', best_deal.image_url,
            'product_url', best_deal.product_url,
            'price', tag_price,
            'original_price', tag_original_price,
            'raw_price', best_deal.price,
            'raw_original_price', best_deal.original_price,
            'discount_pct', round((1 - tag_price / nullif(tag_original_price, 0)) * 100),
            'quantity_estimated', tag_estimated,
            'original_price_source', best_deal.original_price_source,
            'price_estimated', tag_price_estimated,
            'fragment_by_weight', best_deal.fragment_by_weight,
            'package_weight_g', best_deal.package_weight_g,
            'price_unit', best_deal.price_unit,
            'deal_item_name', best_deal.item_name,
            'bundle_count', best_deal.bundle_count,
            'package_volume_ml', best_deal.package_volume_ml
          );
          total := total + tag_contribution;
        end if;
      end if;

      if not matched then
        best_deal_words := 0;
        best_keyword_words := 0;

        for deal in
          select * from deal_cache
          where keyword_matches is not null and array_length(keyword_matches, 1) > 0
        loop
          foreach keyword in array deal.keyword_matches loop
            keyword_words := public.normalize_words(keyword);
            if array_length(keyword_words, 1) > 0
               and public.words_loosely_subset(keyword_words, ing_words)
            then
              if array_length(keyword_words, 1) > best_keyword_words then
                best_deal := deal;
                best_keyword_words := array_length(keyword_words, 1);
              elsif best_keyword_words > 0 and array_length(keyword_words, 1) = best_keyword_words and deal.price < best_deal.price then
                best_deal := deal;
              end if;
            end if;
          end loop;
        end loop;

        if best_keyword_words > 0 then
          select p.tag_price, p.tag_original_price, p.tag_quantity_estimated, p.tag_price_estimated, p.tag_contribution
            into tag_price, tag_original_price, tag_estimated, tag_price_estimated, tag_contribution
          from public.compute_deal_tag_pricing(
            best_deal.price, best_deal.original_price, best_deal.price_unit, best_deal.package_weight_g,
            best_deal.package_weight_g_source, best_deal.fragment_by_weight, best_deal.quantity_estimated,
            ing->>'quantity', ing->>'unit', ing->>'name',
            best_deal.bundle_count, best_deal.package_volume_ml
          ) p;

          if tag_price is not null then
            matched := true;
            matched_deal_ids := array_append(matched_deal_ids, best_deal.id);
            new_tags := new_tags || jsonb_build_object(
              'name', ing->>'name',
              'store', best_deal.chain_name,
              'image_url', best_deal.image_url,
              'product_url', best_deal.product_url,
              'price', tag_price,
              'original_price', tag_original_price,
              'raw_price', best_deal.price,
              'raw_original_price', best_deal.original_price,
              'discount_pct', round((1 - tag_price / nullif(tag_original_price, 0)) * 100),
              'quantity_estimated', tag_estimated,
              'original_price_source', best_deal.original_price_source,
              'price_estimated', tag_price_estimated,
              'fragment_by_weight', best_deal.fragment_by_weight,
              'package_weight_g', best_deal.package_weight_g,
              'price_unit', best_deal.price_unit,
              'deal_item_name', best_deal.item_name,
              'bundle_count', best_deal.bundle_count,
              'package_volume_ml', best_deal.package_volume_ml
            );
            total := total + tag_contribution;
          end if;
        end if;
      end if;

      if not matched then
        best_staple_price := null;
        best_staple_unit := null;
        best_staple_words := 0;
        alias_ing_words := public.staple_alias_words(ing_words);

        for staple in select * from staple_cache order by tier_rank loop
          if array_length(staple.staple_words, 1) > 0
             and not (array_length(staple.staple_words, 1) = 1 and staple.ingredient_name ~* '\yfrozen\y')
             and staple.staple_words <@ alias_ing_words
             and array_length(staple.staple_words, 1) > best_staple_words
          then
            best_staple_price := staple.avg_price;
            best_staple_unit := staple.unit;
            best_staple_words := array_length(staple.staple_words, 1);
          end if;
        end loop;

        if best_staple_price is not null then
          scaled := public.scale_reference_price(
            coalesce(ing->>'price_quantity', ing->>'quantity'),
            coalesce(ing->>'price_unit', ing->>'unit'),
            ing->>'name',
            best_staple_price, best_staple_unit
          );
          if scaled is not null then
            total := total + scaled;
          end if;
        end if;
      end if;
    end loop;

    new_price := case when rec.servings > 0 then round(total / rec.servings, 2) else round(total, 2) end;
    if p_published then
      update public.recipes set deal_tags = new_tags, price = new_price where id = rec.id;
    else
      update public.recipes set draft_deal_tags = new_tags, draft_price = new_price where id = rec.id;
    end if;
  end loop;

  if array_length(matched_deal_ids, 1) > 0 then
    update public.curated_deals set used_in_recipe = true where id = any(matched_deal_ids);
  end if;
end;
$$;

-- Keep the SECURITY DEFINER the zero-argument version had
-- (20260801060000_refresh_deal_tags_security_definer.sql) -- it's
-- recreated here, so the old ALTER no longer applies.
alter function public.refresh_recipe_deal_tags(boolean) security definer;

comment on function public.refresh_recipe_deal_tags(boolean) is
  'Rebuilds recipe deal tags and price against ONE week of curated_deals: p_published = true (default) prices the live week into recipes.deal_tags/price; false prices the draft week into recipes.draft_deal_tags/draft_price (20260918 weekly publish). Otherwise identical to 20260914020000: temp-table precompute, exact-match then keyword-fallback passes restricted to usage <> ''deals'', most specific candidate wins with lower price breaking ties, staple fallback (statcan/produce/staple) unchanged. used_in_recipe is reset/set only within the same week.';

-- Swap the draft week in as the new live week, in one transaction.
-- Called only by the publish-week Edge Function (service role) -- never
-- directly by shoppers.
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
    -- A draft made only of produce-gap rows has no flyer-path dates.
    select min(flyer_valid_from), max(flyer_valid_to) into v_from, v_to
    from public.curated_deals where published = false;
  end if;

  select count(*) filter (where status = 'approved'), count(*) filter (where status = 'pending')
    into deals_published, deals_still_pending
  from public.curated_deals where published = false;

  delete from public.curated_deals where published = true;
  update public.curated_deals set published = true where published = false;

  insert into public.published_week (id, flyer_valid_from, flyer_valid_to, published_at)
  values (1, v_from, v_to, now())
  on conflict (id) do update
    set flyer_valid_from = excluded.flyer_valid_from,
        flyer_valid_to = excluded.flyer_valid_to,
        published_at = excluded.published_at;

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

revoke execute on function public.publish_week() from public, anon, authenticated;
grant execute on function public.publish_week() to service_role;

comment on function public.publish_week() is
  'Weekly publish (20260918): deletes the live week, promotes every draft row (published = false) to live, records the week''s flyer dates in published_week, makes recipes.featured_next the live featured set, then re-prices recipes against the new live week. Pending/rejected draft rows are promoted too but stay invisible to shoppers via RLS. Service role only.';

select public.refresh_recipe_deal_tags(true);
