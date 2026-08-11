-- curated_deals.price/original_price have never recorded what they
-- actually represent -- a flat package total (the assumption every
-- caller has always made) or a per-unit-weight rate (per lb/kg/100g,
-- common for fresh meat/produce). Confirmed real, live cases of this
-- ambiguity this session by reading the actual flyer cutout images:
-- "Prime raised without antibiotics boneless skinless chicken breasts"
-- (Walmart, $8.20/lb -> $6.79/lb, no fixed package weight) and
-- "GREEN, GREY OR YELLOW ZUCCHINI" (No Frills, $1.99/lb, genuinely
-- bulk) were both being credited as if $6.79/$1.99 bought the whole
-- package, when they're really per-lb rates -- undercharging every
-- recipe that tags them. Adds the missing unit context, reviewed by
-- hand (via a new dev-only screen, app/app/dev-deals.tsx, looking at
-- each deal's own cutout photo) rather than guessed.
create type public.deal_price_unit as enum ('package', 'each', 'lb', 'kg', '100g');

alter table public.curated_deals
  add column price_unit public.deal_price_unit not null default 'package',
  -- The physical weight of one retail package, when price_unit is a
  -- rate (lb/kg/100g) and the item genuinely comes in one -- e.g. the
  -- chicken breasts' "3-pieces" pack. Left null for genuinely bulk/
  -- loose-priced items with no fixed package at all (e.g. the
  -- zucchini) -- compute_deal_tag_pricing() below treats null here as
  -- "scale the rate against whatever this recipe's own ingredient
  -- line calls for" instead of assuming one package's worth.
  add column package_weight_g numeric(10, 2) check (package_weight_g is null or package_weight_g > 0),
  -- Same shape as deal_item_nutrition_reference.package_grams_source
  -- (see 20260807020000_deal_item_package_grams_source.sql), plus
  -- 'measured' for a weight Anabelle took herself off a physical
  -- package, since this table's provenance need isn't identical to
  -- that one's.
  add column package_weight_g_source text check (package_weight_g_source in ('label', 'measured', 'estimated')),
  -- Previously hardcoded false in every branch of
  -- refresh_recipe_deal_tags() below -- now set by whoever reviews
  -- the deal's pricing, same intent DealTag.quantityEstimated already
  -- had client-side but nothing upstream ever actually populated.
  add column quantity_estimated boolean not null default false,
  -- Deliberately separate from the existing reviewed_by/reviewed_at
  -- (those track the Airtable pending->approved workflow) -- this is
  -- "has the *pricing detail* been reviewed", independent of approval
  -- status, so the new screen has a clean "not yet reviewed" filter
  -- that isn't conflated with a row's approval state.
  add column pricing_reviewed_at timestamptz;

comment on column public.curated_deals.price_unit is
  'What price/original_price are denominated in. ''package''/''each'' (the historical default/assumption) means the number is already a whole-package total, credited once per package as before. ''lb''/''kg''/''100g'' means it''s a rate -- refresh_recipe_deal_tags() (via compute_deal_tag_pricing()) multiplies it by package_weight_g (or, if that''s null, by however much the tagged recipe ingredient itself calls for) to get a real cost, instead of crediting the raw rate as if it were a total.';
comment on column public.curated_deals.package_weight_g is
  'The physical weight of one retail package, only meaningful when price_unit is a rate (lb/kg/100g). Null for genuinely bulk/loose-priced items with no fixed package (e.g. zucchini sold by the lb with no bag) -- see compute_deal_tag_pricing() for how that case is handled.';
comment on column public.curated_deals.pricing_reviewed_at is
  'When a human last confirmed this row''s price/original_price/price_unit/package_weight_g against the real flyer cutout (via app/app/dev-deals.tsx) -- independent of reviewed_at/reviewed_by, which track the separate Airtable approve/reject workflow.';

-- Computes the real per-package price/original_price for one deal-tag
-- match, given the deal's own price_unit and (if relevant)
-- package_weight_g, plus the specific recipe ingredient line being
-- tagged (needed to fall back to "scale against however much THIS
-- recipe uses" when there's no fixed package weight to fall back on).
-- Extracted into its own function -- rather than inlined a second time
-- into refresh_recipe_deal_tags()'s Pass 2 loop, as every version of
-- this function before it did -- specifically because that duplication
-- is exactly how a prior fix for this same class of bug
-- (20260801160000_scale_weight_priced_produce_deals.sql) got silently
-- dropped when 20260808000000 rewrote the function from an older base
-- that didn't have it. One copy of this logic can't drift out of sync
-- with itself the way two copies already have.
create or replace function public.compute_deal_tag_pricing(
  p_price numeric,
  p_original_price numeric,
  p_price_unit public.deal_price_unit,
  p_package_weight_g numeric,
  p_quantity_estimated boolean,
  p_ing_quantity text,
  p_ing_unit text
) returns table (tag_price numeric, tag_original_price numeric, tag_quantity_estimated boolean)
language plpgsql
as $$
declare
  ing_ua public.unit_amount;
  package_count numeric;
  grams_per_unit numeric;
  effective_weight_g numeric;
begin
  ing_ua := public.parse_unit_amount(p_ing_quantity, p_ing_unit);

  if p_price_unit in ('package', 'each') then
    -- Unchanged from every prior version of this logic: credit the
    -- flat price once per whole package the recipe's stated
    -- quantity/unit calls for -- never fragmented.
    package_count := case
      when ing_ua.base_unit = 'each' and ing_ua.amount is not null and ing_ua.amount > 1
        then ing_ua.amount
      else 1
    end;
    tag_price := round(p_price * package_count, 2);
    tag_original_price := round(p_original_price * package_count, 2);
    tag_quantity_estimated := p_quantity_estimated;
    return next;
    return;
  end if;

  -- price_unit is lb/kg/100g: p_price is a RATE, not a package total.
  -- Mirrors app/lib/unitConversion.ts's parseUnitAmount() conversion
  -- table exactly (lb=453.592g, kg=1000g) -- keep these in sync if
  -- either ever changes.
  grams_per_unit := case p_price_unit
    when 'lb' then 453.592
    when 'kg' then 1000
    when '100g' then 100
  end;

  -- A labeled grab-and-go package (chicken breasts: package_weight_g
  -- set, even if only estimated) uses that fixed weight -- you're
  -- buying one whole package regardless of the recipe's own quantity,
  -- same never-fragment principle as the package/each branch above.
  -- Genuinely bulk/loose produce (zucchini: package_weight_g null) has
  -- no "one package" to buy -- scale the rate directly against however
  -- much THIS recipe calls for instead, the same math
  -- scale_reference_price() already uses for staple ingredients.
  effective_weight_g := coalesce(
    p_package_weight_g,
    case when ing_ua.base_unit = 'g' then ing_ua.amount else null end
  );

  if effective_weight_g is null then
    -- Can't scale a per-weight rate against an unparseable/non-weight
    -- recipe quantity (e.g. "to taste") -- leave the gap visible
    -- (caller falls through to the staple-reference fallback) rather
    -- than invent a number, same policy scale_reference_price() uses.
    tag_price := null;
    tag_original_price := null;
    tag_quantity_estimated := null;
    return next;
    return;
  end if;

  tag_price := round(p_price * (effective_weight_g / grams_per_unit), 2);
  tag_original_price := round(p_original_price * (effective_weight_g / grams_per_unit), 2);
  -- Bulk (no fixed package weight) is inherently an estimate regardless
  -- of what the curator flagged; a labeled package still respects her
  -- own quantity_estimated call.
  tag_quantity_estimated := p_quantity_estimated or (p_package_weight_g is null);
  return next;
end;
$$;

comment on function public.compute_deal_tag_pricing(numeric, numeric, public.deal_price_unit, numeric, boolean, text, text) is
  'Computes the real tag_price/tag_original_price/tag_quantity_estimated for one deal-tag match, branching on the deal''s price_unit -- package/each unchanged (flat price x package_count), lb/kg/100g scaled by package_weight_g (or, if null, by the recipe ingredient''s own weight) instead of credited raw. Shared by both passes of refresh_recipe_deal_tags() so a future fix only has to land once.';

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
               price_unit, package_weight_g, quantity_estimated
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
            'quantity_estimated', tag_estimated
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
                 price_unit, package_weight_g, quantity_estimated
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
              'quantity_estimated', tag_estimated
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
  'Rebuilds deal_tags and price for every recipe from scratch against the current curated_deals table. Two full passes per ingredient, in order: (1) exact name match against every approved deal (deal_words <@ ing_words) -- always checked to completion first, so a real exact match can never lose to a keyword collision regardless of row order; (2) only if pass 1 found nothing, a human-curated keyword fallback -- matches if any of a deal''s keyword_matches phrases has all its words loosely present (singular/plural-tolerant) in the ingredient''s name. Per-match pricing (package-count crediting, or per-weight-rate scaling by package_weight_g) is delegated to compute_deal_tag_pricing() -- see that function''s own comment for the price_unit branching. A deal-tagged ingredient with no computable price (e.g. a bulk-rate deal matched to a recipe line with no parseable weight) falls through to the staple-reference fallback instead of being tagged with a null/garbage price.';

-- Every existing row defaults to price_unit='package',
-- package_weight_g=null, quantity_estimated=false -- byte-identical to
-- the prior hardcoded behavior, so this refresh is a true no-op until
-- Anabelle actually reviews a row via the new screen.
select public.refresh_recipe_deal_tags();
