-- Anabelle: K-Pogo's deep-frying oil needs 500 mL bought (to submerge
-- the pogos) but only ~30 mL is actually eaten -- crediting the full
-- 500 mL as consumed calories was wildly wrong (deep-frying oil doesn't
-- get eaten at the volume it's poured), but crediting only 30 mL toward
-- the recipe's REAL cost understates what she'd actually spend on oil.
-- No existing mechanism split "quantity for nutrition" from "quantity
-- for cost" on a plain (non-deal) staple ingredient -- fragment_by_weight
-- solves the analogous problem for DEAL items, nothing did for staples.
--
-- Adds two optional ingredient JSON keys, price_quantity/price_unit,
-- read ONLY by the staple-fallback pricing tier (never nutrition, never
-- deal-tag matching) via coalesce -- absent on every other recipe's
-- ingredients today, so this is a true no-op everywhere except an
-- ingredient that explicitly sets them. nutrition keeps reading the
-- real quantity/unit always, unaffected.
--
-- Follow-up to 20260817000000: package_weight_g alone isn't a safe
-- signal to gate the client's each-count "1 package" override on --
-- 'each'-priced produce deals (GREEN ONIONS, KALE, Broccoli Crown,
-- CAULIFLOWER) ALSO have package_weight_g set (the real weight of ONE
-- each-unit, e.g. one bunch), for an unrelated reason (per-lb/kg
-- scaling elsewhere). compute_deal_tag_pricing()'s own avg-weight-
-- bridge override only ever applies when price_unit = 'package' --
-- threading price_unit through to deal_tags too lets the client gate
-- on the exact same condition instead of approximating it, so a future
-- each-priced deal whose ingredient name happens to coincide with a
-- STAPLE_AVG_WEIGHT_G_PER_EACH key can never be misread as "buy N
-- packages" when it really just means "N individual each-priced units".
--
-- Anabelle: K-Pogo's badge showed "4" next to "Pogo pups" and read as
-- "4 boxes of 20", not "4 individual pogos from one box" -- same
-- confusion class as the pricing bug fixed in 20260815010000, just on
-- the client display side this time. describeDealPackage()
-- (app/lib/unitConversion.ts) already solves this for gram-based
-- quantities (always shows "1 package" instead of a raw gram number),
-- but explicitly skips each-based quantities, assuming a bare count is
-- always meaningful as-is -- true for "4 Hamburger buns" (4 buns really
-- are 4 buns), false for "4 Pogo pups" (4 individual items pulled from
-- one 20-count box).
--
-- The server already knows the real answer (compute_deal_tag_pricing's
-- avg-weight-bridge package_count) but never told the client -- this
-- migration is the mechanical passthrough that lets the client redo the
-- same ceil(grams/package_weight_g) math for DISPLAY, the same way
-- original_price_source/fragment_by_weight were threaded through
-- before. No pricing/nutrition change -- deal_tags.price/tag_contribution
-- are untouched, this only adds a new key to the JSON.
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
  alias_ing_words text[];
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
  tag_price_estimated boolean;
  tag_contribution numeric;
  matched_deal_ids uuid[] := '{}';
begin
  update public.curated_deals set used_in_recipe = false where used_in_recipe = true;

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
        select id, item_name, chain_name, image_url, price, original_price, product_url,
               price_unit, package_weight_g, package_weight_g_source, fragment_by_weight,
               quantity_estimated, original_price_source
        from public.curated_deals
        where status = 'approved'
      loop
        deal_words := public.normalize_words(deal.item_name);
        if array_length(deal_words, 1) > 0 and deal_words <@ ing_words then
          select p.tag_price, p.tag_original_price, p.tag_quantity_estimated, p.tag_price_estimated, p.tag_contribution
            into tag_price, tag_original_price, tag_estimated, tag_price_estimated, tag_contribution
          from public.compute_deal_tag_pricing(
            deal.price, deal.original_price, deal.price_unit, deal.package_weight_g,
            deal.package_weight_g_source, deal.fragment_by_weight, deal.quantity_estimated,
            ing->>'quantity', ing->>'unit', ing->>'name'
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
          matched_deal_ids := array_append(matched_deal_ids, deal.id);
          new_tags := new_tags || jsonb_build_object(
            'name', ing->>'name',
            'store', deal.chain_name,
            'image_url', deal.image_url,
            'product_url', deal.product_url,
            'price', tag_price,
            'original_price', tag_original_price,
            'discount_pct', round((1 - tag_price / tag_original_price) * 100),
            'quantity_estimated', tag_estimated,
            'original_price_source', deal.original_price_source,
            'price_estimated', tag_price_estimated,
            'fragment_by_weight', deal.fragment_by_weight,
            'package_weight_g', deal.package_weight_g,
            'price_unit', deal.price_unit
          );
          total := total + tag_contribution;
          exit;
        end if;
      end loop;

      -- Pass 2: keyword fallback -- only runs if pass 1 found nothing
      -- for this ingredient anywhere.
      if not matched then
        for deal in
          select id, item_name, chain_name, image_url, price, original_price, product_url, keyword_matches,
                 price_unit, package_weight_g, package_weight_g_source, fragment_by_weight,
                 quantity_estimated, original_price_source
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
            select p.tag_price, p.tag_original_price, p.tag_quantity_estimated, p.tag_price_estimated, p.tag_contribution
              into tag_price, tag_original_price, tag_estimated, tag_price_estimated, tag_contribution
            from public.compute_deal_tag_pricing(
              deal.price, deal.original_price, deal.price_unit, deal.package_weight_g,
              deal.package_weight_g_source, deal.fragment_by_weight, deal.quantity_estimated,
              ing->>'quantity', ing->>'unit', ing->>'name'
            ) p;

            if tag_price is null then
              matched := false;
              continue;
            end if;

            matched_deal_ids := array_append(matched_deal_ids, deal.id);
            new_tags := new_tags || jsonb_build_object(
              'name', ing->>'name',
              'store', deal.chain_name,
              'image_url', deal.image_url,
              'product_url', deal.product_url,
              'price', tag_price,
              'original_price', tag_original_price,
              'discount_pct', round((1 - tag_price / tag_original_price) * 100),
              'quantity_estimated', tag_estimated,
              'original_price_source', deal.original_price_source,
              'price_estimated', tag_price_estimated,
              'fragment_by_weight', deal.fragment_by_weight,
              'package_weight_g', deal.package_weight_g
            );
            total := total + tag_contribution;
            exit;
          end if;
        end loop;
      end if;

      if not matched then
        best_staple_price := null;
        best_staple_unit := null;
        best_staple_words := 0;
        -- Aliased only for the staple-reference-price fallback below --
        -- deal matching above stays literal (see 20260801080000).
        alias_ing_words := public.staple_alias_words(ing_words);

        for staple in
          select ingredient_name, avg_price, unit from public.statcan_reference_prices
        loop
          staple_words := public.staple_alias_words(public.normalize_words(staple.ingredient_name));
          if array_length(staple_words, 1) > 0
             and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\yfrozen\y')
             and staple_words <@ alias_ing_words
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
            staple_words := public.staple_alias_words(public.normalize_words(staple.ingredient_name));
            if array_length(staple_words, 1) > 0
               and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\yfrozen\y')
               and staple_words <@ alias_ing_words
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
            staple_words := public.staple_alias_words(public.normalize_words(staple.ingredient_name));
            if array_length(staple_words, 1) > 0
               and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\yfrozen\y')
               and staple_words <@ alias_ing_words
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

    update public.recipes
      set deal_tags = new_tags,
          price = case when rec.servings > 0 then round(total / rec.servings, 2) else round(total, 2) end
      where id = rec.id;
  end loop;

  if array_length(matched_deal_ids, 1) > 0 then
    update public.curated_deals set used_in_recipe = true where id = any(matched_deal_ids);
  end if;
end;
$$;

comment on function public.refresh_recipe_deal_tags() is
  'Rebuilds deal_tags and price for every recipe from scratch against the current curated_deals table, and used_in_recipe on curated_deals itself. Two full passes per ingredient (exact match, then keyword fallback) -- see compute_deal_tag_pricing() for the pricing/package_count logic. Each tag also carries original_price_source, price_estimated, fragment_by_weight, and package_weight_g (the deal''s real known package weight, or null when genuinely unknown/bulk), and price_unit -- package_weight_g lets the client redo the same avg-weight-bridge package-count math server-side pricing already does, so an each-count ingredient display (e.g. "4 Pogo pups" from a 20-pack) can show the real "1 package required" instead of misreading the raw count as a package multiplier; price_unit is threaded alongside it so the client only applies that override when price_unit = ''package'' (matching compute_deal_tag_pricing()''s own gate exactly), since some ''each''-priced produce deals also carry a real package_weight_g for an unrelated reason.';

select public.refresh_recipe_deal_tags();
