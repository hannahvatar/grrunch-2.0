-- Found while adding "TikTok Baked Feta Pasta": its "Pasta (penne or
-- rigatoni)" ingredient priced/nutrition'd at $0/0 despite "Dry or fresh
-- pasta" (a real, statcan-checked, nutrition-reviewed-via-Spaghetti-alias
-- reference) existing. Root cause -- TWO real regressions, both
-- introduced silently by 20260808000000_scale_deal_price_by_quantity.sql
-- when it rebuilt refresh_recipe_deal_tags() for per-quantity deal
-- pricing, apparently starting from an older base version of the
-- function than the one actually live at the time:
--
-- 1. staple_alias_words() (added 20260801080000, mapping pasta shapes
--    like Spaghetti/Penne/Rigatoni/Macaroni -> "pasta" specifically for
--    the staple-reference fallback tier) was silently dropped -- no
--    comment, no migration explaining its removal, unlike the deliberate
--    fixed/flexible column drop in 20260808010000. Every migration
--    since (20260808040000 through 20260812010000, the current live
--    version) kept copying the function forward WITHOUT it.
-- 2. The single-word "fresh|frozen" exclusion guard, deliberately
--    narrowed to just "frozen" in 20260801110000 (see that migration's
--    own comment -- "Dry or fresh pasta" is the ONLY "fresh"-containing
--    entry in statcan_reference_prices, and excluding it silently
--    blocked ALL pasta price matching with no real protective benefit),
--    was ALSO silently reintroduced to "(fresh|frozen)" by the same
--    20260808000000 migration.
--
-- Net effect since 2026-08-08: any recipe ingredient not individually
-- cataloged (i.e. relying on the pasta-shape alias, like "Penne" or
-- "Rigatoni" alone, or anything literally named "Pasta") could never
-- match ANY pasta reference at all -- "Dry or fresh pasta" was excluded
-- outright, and the alias that would let a shape-named ingredient reach
-- "Spaghetti"'s own fully-reviewed price+nutrition was gone. Recipes
-- naming pasta ingredients "Spaghetti" directly (e.g. Sardine & Tomato
-- Pasta) were unaffected -- that exact name still matches its own
-- dedicated, already-reviewed staple_reference_prices row with no
-- aliasing needed.
--
-- This migration restores both fixes on top of the CURRENT (2026-08-12)
-- function -- two-pass deal matching, compute_deal_tag_pricing,
-- original_price_source/price_estimated flags all untouched, alias
-- bridging + the narrower guard added back into the staple-fallback
-- tier only (never deal-credit matching, same scoping as originally
-- documented in 20260801080000).
--
-- Deliberately NOT touching any table's trust flags (checked_by,
-- nutrition_reviewed_by) here -- "Feta cheese" (checked_by='ai_estimated')
-- and "Fresh basil"/basil generally (no reference row at all) are
-- separate, genuine data gaps this migration does not paper over; they
-- still need an actual human review, not a fabricated one.

create or replace function public.staple_alias_words(words text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(
    case w
      when 'spaghetti' then 'pasta'
      when 'spaghettini' then 'pasta'
      when 'macaroni' then 'pasta'
      when 'rigatoni' then 'pasta'
      when 'penne' then 'pasta'
      when 'fusilli' then 'pasta'
      when 'rotini' then 'pasta'
      when 'linguine' then 'pasta'
      when 'fettuccine' then 'pasta'
      when 'farfalle' then 'pasta'
      when 'orzo' then 'pasta'
      when 'ziti' then 'pasta'
      when 'vermicelli' then 'pasta'
      else w
    end
  ), '{}')
  from unnest(words) as w;
$$;

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
               price_unit, package_weight_g, package_weight_g_source, quantity_estimated, original_price_source
        from public.curated_deals
        where status = 'approved'
      loop
        deal_words := public.normalize_words(deal.item_name);
        if array_length(deal_words, 1) > 0 and deal_words <@ ing_words then
          select p.tag_price, p.tag_original_price, p.tag_quantity_estimated, p.tag_price_estimated
            into tag_price, tag_original_price, tag_estimated, tag_price_estimated
          from public.compute_deal_tag_pricing(
            deal.price, deal.original_price, deal.price_unit, deal.package_weight_g,
            deal.package_weight_g_source, deal.quantity_estimated, ing->>'quantity', ing->>'unit'
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
            'original_price_source', deal.original_price_source,
            'price_estimated', tag_price_estimated
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
                 price_unit, package_weight_g, package_weight_g_source, quantity_estimated, original_price_source
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
            select p.tag_price, p.tag_original_price, p.tag_quantity_estimated, p.tag_price_estimated
              into tag_price, tag_original_price, tag_estimated, tag_price_estimated
            from public.compute_deal_tag_pricing(
              deal.price, deal.original_price, deal.price_unit, deal.package_weight_g,
              deal.package_weight_g_source, deal.quantity_estimated, ing->>'quantity', ing->>'unit'
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
              'original_price_source', deal.original_price_source,
              'price_estimated', tag_price_estimated
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
  'Rebuilds deal_tags and price for every recipe from scratch against the current curated_deals table. Two full passes per ingredient, in order: (1) exact name match against every approved deal (deal_words <@ ing_words) -- always checked to completion first, so a real exact match can never lose to a keyword collision regardless of row order; (2) only if pass 1 found nothing, a human-curated keyword fallback -- matches if any of a deal''s keyword_matches phrases has all its words loosely present (singular/plural-tolerant) in the ingredient''s name. Per-match pricing (package-count crediting, or per-weight-rate scaling by package_weight_g) is delegated to compute_deal_tag_pricing() -- see that function''s own comment for the price_unit branching. Each tag also carries original_price_source (''flyer'' vs. ''reference'') and price_estimated (true only when the tag''s dollar total was scaled by a GUESSED package weight, not a labeled/measured one) so display components can flag both kinds of uncertainty distinctly. A deal-tagged ingredient with no computable price (e.g. a bulk-rate deal matched to a recipe line with no parseable weight) falls through to the staple-reference fallback instead of being tagged with a null/garbage price. The staple-reference fallback tier (only, never deal-credit matching) runs both the ingredient''s AND every candidate reference row''s words through staple_alias_words() first, so a pasta-shape ingredient (Penne, Rigatoni, Macaroni, ...) with no dedicated reference row of its own can still match a generic "pasta" reference (or another shape''s own dedicated row, e.g. Spaghetti''s).';

-- Re-materialize every recipe now that the alias bridge + guard fix are
-- back -- expected to change price/deal_tags only for recipes actually
-- naming a pasta shape that previously had zero staple-reference match
-- (e.g. this migration's own trigger case). Anything already matching
-- via a dedicated reference row (Spaghetti) or a real curated_deals
-- match is untouched.
select public.refresh_recipe_deal_tags();

-- Same guard fix for the read-only find_reference_price() lookup used
-- by app/app/dev-deals.tsx (20260811020000) -- it never had the alias
-- bridge (deliberately, per its own comment -- a different shape of
-- problem, no recipe quantity to scale against), but it inherited the
-- same "(fresh|frozen)" guard at creation time, after the bridge/guard
-- fix had already regressed elsewhere. Narrowing it the same way keeps
-- both functions' matching conventions consistent, as documented.
create or replace function public.find_reference_price(p_item_name text)
returns table (source text, matched_name text, result_price numeric, result_unit text)
language plpgsql
as $$
declare
  item_words text[];
  ref_words text[];
  best_words int;
  ref record;
begin
  item_words := public.normalize_words(p_item_name);
  best_words := 0;

  for ref in select ingredient_name, avg_price, unit from public.statcan_reference_prices loop
    ref_words := public.normalize_words(ref.ingredient_name);
    if array_length(ref_words, 1) > 0
       and not (array_length(ref_words, 1) = 1 and ref.ingredient_name ~* '\yfrozen\y')
       and ref_words <@ item_words
       and array_length(ref_words, 1) > best_words
    then
      source := 'statcan';
      matched_name := ref.ingredient_name;
      result_price := ref.avg_price;
      result_unit := ref.unit;
      best_words := array_length(ref_words, 1);
    end if;
  end loop;

  if best_words = 0 then
    for ref in select ingredient_name, avg_price, unit from public.produce_reference_prices loop
      ref_words := public.normalize_words(ref.ingredient_name);
      if array_length(ref_words, 1) > 0
         and not (array_length(ref_words, 1) = 1 and ref.ingredient_name ~* '\yfrozen\y')
         and ref_words <@ item_words
         and array_length(ref_words, 1) > best_words
      then
        source := 'produce';
        matched_name := ref.ingredient_name;
        result_price := ref.avg_price;
        result_unit := ref.unit;
        best_words := array_length(ref_words, 1);
      end if;
    end loop;
  end if;

  if best_words = 0 then
    for ref in
      select ingredient_name, avg_price, unit
      from public.staple_reference_prices
      where checked_by <> 'ai_estimated'
    loop
      ref_words := public.normalize_words(ref.ingredient_name);
      if array_length(ref_words, 1) > 0
         and not (array_length(ref_words, 1) = 1 and ref.ingredient_name ~* '\yfrozen\y')
         and ref_words <@ item_words
         and array_length(ref_words, 1) > best_words
      then
        source := 'staple';
        matched_name := ref.ingredient_name;
        result_price := ref.avg_price;
        result_unit := ref.unit;
        best_words := array_length(ref_words, 1);
      end if;
    end loop;
  end if;

  if best_words > 0 then
    return next;
  end if;
  return;
end;
$$;

comment on function public.find_reference_price(text) is
  'Read-only informational lookup for app/app/dev-deals.tsx: given a curated_deals.item_name, finds the best-matching statcan/produce/staple reference price (same 3-tier fallback + word-subset matching convention as refresh_recipe_deal_tags()''s own staple-fallback block, but standalone -- no quantity scaling, since there''s no recipe quantity to scale against here, and no pasta-shape aliasing either -- deliberately simpler). Returns zero rows when nothing matches, which is expected/common for branded packaged goods that these reference tables don''t cover at all.';
