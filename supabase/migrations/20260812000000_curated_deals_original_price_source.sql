-- curated_deals.original_price has never recorded WHERE it came from --
-- and it actually has two very different provenances that look
-- identical once stored. Found reviewing deals by hand in
-- app/app/dev-deals.tsx (CAULIFLOWER: a StatCan-derived reference price
-- of $4.50 vs. a displayed $3.99 looked like an "11% off" flyer deal,
-- but the store never printed $4.50 anywhere):
--
-- 1. The normal case -- scripts/sync_weekly_deals.py's
--    sync_curated_deals(), pulling straight from Airtable's "Deals"
--    table -- original_price is a real "Reg. $X" the store itself
--    printed on the flyer.
-- 2. resolve_produce_gaps() (same file) -- for a "price-only" produce
--    item with no printed regular price at all (flagged by
--    scripts/scan_produce_flyers.py into Airtable's "Produce Reference
--    Gaps" table), a StatCan or human-researched COMPARISON price gets
--    filled in and pushed straight into original_price, purely so the
--    item earns a discount_pct and shows up as a deal at all. That
--    number was never on any flyer -- it's ours, not the store's.
--
-- Showing case 2 with the exact same strikethrough-original-price +
-- "N% off" badge treatment the app uses for case 1 implies the
-- retailer marked the item down, which isn't true. This column lets
-- every display site (see app/lib/curatedDeals.ts's
-- isReferencePriced()/showsRealDiscount()/formatComparePriceLabel())
-- tell the two apart and stop making that claim for case 2.
--
-- Plain text + check, not a Postgres enum -- this is a passthrough
-- label carried through refresh_recipe_deal_tags() into deal_tags
-- JSON, never branched on inside compute_deal_tag_pricing()'s
-- arithmetic the way deal_price_unit is. Same choice already made for
-- package_weight_g_source.
alter table public.curated_deals
  add column original_price_source text not null default 'flyer'
    check (original_price_source in ('flyer', 'reference'));

comment on column public.curated_deals.original_price_source is
  '''flyer'' (default) means original_price is a real price the store printed on the flyer (sync_curated_deals() in scripts/sync_weekly_deals.py). ''reference'' means it was DERIVED by us -- a StatCan or human-researched comparison price backfilled by resolve_produce_gaps() for a price-only produce item with no printed regular price, purely so the item earns a discount_pct. Never render a reference-sourced original_price with the same strikethrough+"N% off" treatment as a flyer one -- see app/lib/curatedDeals.ts.';

-- Backfill: the one reliable signal already in the data.
-- resolve_produce_gaps() writes the SAME Airtable "Produce Reference
-- Gaps" record id (g["id"]) as airtable_record_id on both the
-- produce_reference_prices row it upserts and the curated_deals row it
-- pushes -- so any curated_deals row whose airtable_record_id shows up
-- in produce_reference_prices was, definitionally, pushed by that
-- function and is reference-sourced. category='Produce' and
-- airtable_record_id alone were both considered and rejected as
-- backfill signals (see this migration's design discussion) --
-- category is freeform text a human can also type for a genuinely
-- flyer-sourced produce item, and airtable_record_id alone doesn't
-- encode which Airtable table it came from.
update public.curated_deals
set original_price_source = 'reference'
where airtable_record_id in (
  select airtable_record_id from public.produce_reference_prices where airtable_record_id is not null
);

-- CARIBBEAN AVOCADOS keeps its original airtable_record_id and is
-- already caught by the backfill above -- noted here only so both of
-- this session's manually-reviewed multi-item-cutout rows are
-- accounted for in one place. OKRA is the row that actually needs a
-- statement: it was created by duplicate-curated-deal (see
-- supabase/functions/duplicate-curated-deal/index.ts), which
-- deliberately clears airtable_record_id to null on the copy (that
-- column is unique, so it can't carry the source row's id verbatim) --
-- so it can't be caught by the airtable_record_id backfill above, even
-- though its $3.25 original_price is definitely the same
-- reference-sourced number copied from its source row.
update public.curated_deals
set original_price_source = 'reference'
where id = '25fdf798-0a49-4682-a6cf-5b9d6ecd9268'; -- OKRA

-- Found post-migration by the verification query this migration's own
-- comment recommends (curated_deals rows with product_url='' --
-- resolve_produce_gaps()'s own fingerprint, see the deal_row literal in
-- that function -- that the airtable_record_id backfill above didn't
-- catch): "PC® WHOLE CREMINI or WHITE MUSHROOMS, 454 G" has
-- product_url='', category='Produce', and its airtable_record_id
-- (recBEfhPG6C2UrXpu) genuinely isn't present in
-- produce_reference_prices -- its reference-price row is missing from
-- that table for reasons this migration doesn't need to diagnose, but
-- every other signal (matches every other resolve_produce_gaps() row's
-- exact fingerprint) says it's reference-sourced, not a coincidentally
-- blank-product_url flyer deal.
update public.curated_deals
set original_price_source = 'reference'
where id = '508eb7e1-c137-4ed6-ae4f-ccf332372d03'; -- PC® WHOLE CREMINI or WHITE MUSHROOMS, 454 G

-- refresh_recipe_deal_tags() needs to carry original_price_source
-- through into deal_tags JSON so end-user display components can
-- actually see it per-ingredient, not just on the standalone Deal
-- object. Full body copied from 20260811000000_curated_deals_pricing_review.sql
-- (the current live version) with exactly two mechanical additions per
-- pass: original_price_source added to each curated_deals select list,
-- and passed straight through into each jsonb_build_object() call --
-- a passthrough, not a computed value, so it doesn't touch
-- compute_deal_tag_pricing() at all.
create or replace function public.refresh_recipe_deal_tags()
returns void
language plpgsql
as $$
declare
  rec record;
  ing jsonb;
  deal record;
  staple record;
  new_tags jsonb;
  ing_words text[];
  deal_words text[];
  keyword text;
  keyword_words text[];
  staple_words text[];
  matched boolean;
  total numeric;
  best_staple_price numeric;
  best_staple_unit text;
  best_staple_words int;
  scaled numeric;
  tag_price numeric;
  tag_original_price numeric;
  tag_estimated boolean;
begin
  for rec in select id, ingredients, servings from public.recipes loop
    new_tags := '[]'::jsonb;
    total := 0;

    for ing in select value from jsonb_array_elements(rec.ingredients) loop
      ing_words := public.normalize_words(ing->>'name');
      matched := false;

      -- Pass 1: exact match only, across EVERY approved deal, to
      -- completion, before any keyword is ever considered. This
      -- ordering is load-bearing -- see 20260808041000 for why.
      for deal in
        select item_name, chain_name, image_url, price, original_price, product_url,
               price_unit, package_weight_g, quantity_estimated, original_price_source
        from public.curated_deals
        where status = 'approved'
      loop
        deal_words := public.normalize_words(deal.item_name);
        if array_length(deal_words, 1) > 0 and deal_words <@ ing_words then
          select p.tag_price, p.tag_original_price, p.tag_quantity_estimated
            into tag_price, tag_original_price, tag_estimated
          from public.compute_deal_tag_pricing(
            deal.price, deal.original_price, deal.price_unit, deal.package_weight_g,
            deal.quantity_estimated, ing->>'quantity', ing->>'unit'
          ) p;

          if tag_price is null then
            -- No computable price (a bulk-rate deal whose matched
            -- recipe ingredient has no parseable weight) -- leave
            -- unmatched so this ingredient falls through to the
            -- staple-reference fallback below instead of tagging a
            -- deal with no real price.
            continue;
          end if;

          matched := true;
          new_tags := new_tags || jsonb_build_object(
            'name', ing->>'name',
            'store', deal.chain_name,
            'image_url', deal.image_url,
            'product_url', deal.product_url,
            'price', tag_price,
            'original_price', tag_original_price,
            'discount_pct', round((1 - tag_price / tag_original_price) * 100),
            'quantity_estimated', tag_estimated,
            'original_price_source', deal.original_price_source
          );
          total := total + tag_price;
          exit;
        end if;
      end loop;

      -- Pass 2: keyword fallback -- only runs if pass 1 found nothing
      -- for this ingredient anywhere.
      if not matched then
        for deal in
          select item_name, chain_name, image_url, price, original_price, product_url, keyword_matches,
                 price_unit, package_weight_g, quantity_estimated, original_price_source
          from public.curated_deals
          where status = 'approved' and keyword_matches is not null and array_length(keyword_matches, 1) > 0
        loop
          matched := false;
          foreach keyword in array deal.keyword_matches loop
            keyword_words := public.normalize_words(keyword);
            if public.words_loosely_subset(keyword_words, ing_words) then
              matched := true;
              exit;
            end if;
          end loop;

          if matched then
            select p.tag_price, p.tag_original_price, p.tag_quantity_estimated
              into tag_price, tag_original_price, tag_estimated
            from public.compute_deal_tag_pricing(
              deal.price, deal.original_price, deal.price_unit, deal.package_weight_g,
              deal.quantity_estimated, ing->>'quantity', ing->>'unit'
            ) p;

            if tag_price is null then
              matched := false;
              continue;
            end if;

            new_tags := new_tags || jsonb_build_object(
              'name', ing->>'name',
              'store', deal.chain_name,
              'image_url', deal.image_url,
              'product_url', deal.product_url,
              'price', tag_price,
              'original_price', tag_original_price,
              'discount_pct', round((1 - tag_price / tag_original_price) * 100),
              'quantity_estimated', tag_estimated,
              'original_price_source', deal.original_price_source
            );
            total := total + tag_price;
            exit;
          end if;
        end loop;
      end if;

      if not matched then
        best_staple_price := null;
        best_staple_unit := null;
        best_staple_words := 0;

        for staple in
          select ingredient_name, avg_price, unit from public.statcan_reference_prices
        loop
          staple_words := public.normalize_words(staple.ingredient_name);
          if array_length(staple_words, 1) > 0
             and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\y(fresh|frozen)\y')
             and staple_words <@ ing_words
             and array_length(staple_words, 1) > best_staple_words
          then
            best_staple_price := staple.avg_price;
            best_staple_unit := staple.unit;
            best_staple_words := array_length(staple_words, 1);
          end if;
        end loop;

        if best_staple_price is null then
          for staple in
            select ingredient_name, avg_price, unit from public.produce_reference_prices
          loop
            staple_words := public.normalize_words(staple.ingredient_name);
            if array_length(staple_words, 1) > 0
               and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\y(fresh|frozen)\y')
               and staple_words <@ ing_words
               and array_length(staple_words, 1) > best_staple_words
            then
              best_staple_price := staple.avg_price;
              best_staple_unit := staple.unit;
              best_staple_words := array_length(staple_words, 1);
            end if;
          end loop;
        end if;

        if best_staple_price is null then
          for staple in
            select ingredient_name, avg_price, unit
            from public.staple_reference_prices
            where checked_by <> 'ai_estimated'
          loop
            staple_words := public.normalize_words(staple.ingredient_name);
            if array_length(staple_words, 1) > 0
               and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\y(fresh|frozen)\y')
               and staple_words <@ ing_words
               and array_length(staple_words, 1) > best_staple_words
            then
              best_staple_price := staple.avg_price;
              best_staple_unit := staple.unit;
              best_staple_words := array_length(staple_words, 1);
            end if;
          end loop;
        end if;

        if best_staple_price is not null then
          scaled := public.scale_reference_price(
            ing->>'quantity', ing->>'unit', ing->>'name',
            best_staple_price, best_staple_unit
          );
          if scaled is not null then
            total := total + scaled;
          end if;
        end if;
      end if;
    end loop;

    update public.recipes
      set deal_tags = new_tags,
          price = case when rec.servings > 0 then round(total / rec.servings, 2) else round(total, 2) end
      where id = rec.id;
  end loop;
end;
$$;

comment on function public.refresh_recipe_deal_tags() is
  'Rebuilds deal_tags and price for every recipe from scratch against the current curated_deals table. Two full passes per ingredient, in order: (1) exact name match against every approved deal (deal_words <@ ing_words) -- always checked to completion first, so a real exact match can never lose to a keyword collision regardless of row order; (2) only if pass 1 found nothing, a human-curated keyword fallback -- matches if any of a deal''s keyword_matches phrases has all its words loosely present (singular/plural-tolerant) in the ingredient''s name. Per-match pricing (package-count crediting, or per-weight-rate scaling by package_weight_g) is delegated to compute_deal_tag_pricing() -- see that function''s own comment for the price_unit branching. Each tag also carries original_price_source (''flyer'' vs. ''reference'', straight passthrough of the deal''s own column -- see the comment on curated_deals.original_price_source) so display components can tell a real store markdown apart from our own comparison price. A deal-tagged ingredient with no computable price (e.g. a bulk-rate deal matched to a recipe line with no parseable weight) falls through to the staple-reference fallback instead of being tagged with a null/garbage price.';

-- Unlike prior migrations touching this function, this refresh is NOT
-- a no-op: every recipe tagging a reference-sourced deal (the backfill
-- above) gets original_price_source: "reference" in its deal_tags for
-- the first time, which changes what the live app displays for those
-- tags even though no price number itself changes.
select public.refresh_recipe_deal_tags();
