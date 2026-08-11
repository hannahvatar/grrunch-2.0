-- Anabelle asked how a deal-tag's computed price is derived and found a
-- real gap: for a per-lb/kg/100g deal with a labeled fixed package
-- (e.g. "Prime raised without antibiotics boneless skinless chicken
-- breasts", price_unit='lb', package_weight_g=700), the recipe-tag
-- total ($10.48 = $6.79/lb x 700g) is only as accurate as
-- package_weight_g itself -- and that number can be 'label' (read off
-- the real package), 'measured' (weighed by hand), or 'estimated' (a
-- guess, e.g. "3 pieces ~= 700g"). Nothing in the UI currently
-- distinguishes these -- an estimated-weight price looks exactly as
-- confident as a label-read one. New rule: prefix "est." on any
-- recipe-tag price that was computed from an estimated package weight.
--
-- Deliberately narrow, not a blanket "any uncertainty" flag: a flat
-- package/each price is never an estimate (it's exactly what's
-- printed); the raw per-lb rate shown standalone on Best Deals is also
-- exact (it's literally the flyer's number, package_weight_g never
-- enters into it there); a bulk item with no fixed package
-- (package_weight_g null, scaled against the recipe's own stated
-- ingredient weight) is a DIFFERENT existing concern already covered
-- by quantity_estimated's "*Quantity is estimated. See store"
-- disclaimer (the recipe's own quantity is a real, chef-declared
-- amount, not a guess -- what's uncertain there is how much you'll
-- physically need to buy, not the math). This flag exists specifically
-- for the one case where a real dollar total is built on a guessed
-- physical weight.
--
-- tag_price_estimated is a NEW, separate field from tag_quantity_estimated
-- on purpose -- they answer different questions ("is this a real
-- store weight?" vs "is this quantity a guess?") and the UI treats them
-- differently (an "est." prefix directly on the price number, vs a
-- separate italic disclaimer line under the item name).
create or replace function public.compute_deal_tag_pricing(
  p_price numeric,
  p_original_price numeric,
  p_price_unit public.deal_price_unit,
  p_package_weight_g numeric,
  p_package_weight_g_source text,
  p_quantity_estimated boolean,
  p_ing_quantity text,
  p_ing_unit text
) returns table (
  tag_price numeric,
  tag_original_price numeric,
  tag_quantity_estimated boolean,
  tag_price_estimated boolean
)
language plpgsql
as $$
declare
  ing_ua public.unit_amount;
  package_count numeric;
  grams_per_unit numeric;
  effective_weight_g numeric;
begin
  if p_price is null or p_original_price is null then
    tag_price := null;
    tag_original_price := null;
    tag_quantity_estimated := null;
    tag_price_estimated := null;
    return next;
    return;
  end if;

  ing_ua := public.parse_unit_amount(p_ing_quantity, p_ing_unit);

  if p_price_unit in ('package', 'each') then
    -- Unchanged from every prior version of this logic: credit the
    -- flat price once per whole package the recipe's stated
    -- quantity/unit calls for -- never fragmented. A flat price is
    -- exactly what the flyer printed, never an estimate.
    package_count := case
      when ing_ua.base_unit = 'each' and ing_ua.amount is not null and ing_ua.amount > 1
        then ing_ua.amount
      else 1
    end;
    tag_price := round(p_price * package_count, 2);
    tag_original_price := round(p_original_price * package_count, 2);
    tag_quantity_estimated := p_quantity_estimated;
    tag_price_estimated := false;
    return next;
    return;
  end if;

  -- price_unit is lb/kg/100g: p_price is a RATE, not a package total.
  grams_per_unit := case p_price_unit
    when 'lb' then 453.592
    when 'kg' then 1000
    when '100g' then 100
  end;

  effective_weight_g := coalesce(
    p_package_weight_g,
    case when ing_ua.base_unit = 'g' then ing_ua.amount else null end
  );

  if effective_weight_g is null then
    tag_price := null;
    tag_original_price := null;
    tag_quantity_estimated := null;
    tag_price_estimated := null;
    return next;
    return;
  end if;

  tag_price := round(p_price * (effective_weight_g / grams_per_unit), 2);
  tag_original_price := round(p_original_price * (effective_weight_g / grams_per_unit), 2);
  tag_quantity_estimated := p_quantity_estimated or (p_package_weight_g is null);
  -- The rate itself ($/lb) is always real -- only the TOTAL is uncertain,
  -- and only when it was scaled by a package weight someone guessed
  -- rather than read off the real package or measured by hand. A bulk
  -- item (p_package_weight_g null) has no package weight to guess at
  -- all -- its uncertainty is already captured by tag_quantity_estimated
  -- above, not this flag.
  tag_price_estimated := p_package_weight_g is not null and p_package_weight_g_source = 'estimated';
  return next;
end;
$$;

comment on function public.compute_deal_tag_pricing(numeric, numeric, public.deal_price_unit, numeric, text, boolean, text, text) is
  'Computes the real tag_price/tag_original_price/tag_quantity_estimated/tag_price_estimated for one deal-tag match, branching on the deal''s price_unit -- package/each unchanged (flat price x package_count, never an estimate), lb/kg/100g scaled by package_weight_g (or, if null, by the recipe ingredient''s own weight) instead of credited raw. tag_price_estimated is true only when the scaling weight itself was a guess (package_weight_g_source=''estimated''), distinct from tag_quantity_estimated (whether the BUY quantity is a guess). Shared by both passes of refresh_recipe_deal_tags() so a future fix only has to land once.';

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
  'Rebuilds deal_tags and price for every recipe from scratch against the current curated_deals table. Two full passes per ingredient, in order: (1) exact name match against every approved deal (deal_words <@ ing_words) -- always checked to completion first, so a real exact match can never lose to a keyword collision regardless of row order; (2) only if pass 1 found nothing, a human-curated keyword fallback -- matches if any of a deal''s keyword_matches phrases has all its words loosely present (singular/plural-tolerant) in the ingredient''s name. Per-match pricing (package-count crediting, or per-weight-rate scaling by package_weight_g) is delegated to compute_deal_tag_pricing() -- see that function''s own comment for the price_unit branching. Each tag also carries original_price_source (''flyer'' vs. ''reference'') and price_estimated (true only when the tag''s dollar total was scaled by a GUESSED package weight, not a labeled/measured one) so display components can flag both kinds of uncertainty distinctly. A deal-tagged ingredient with no computable price (e.g. a bulk-rate deal matched to a recipe line with no parseable weight) falls through to the staple-reference fallback instead of being tagged with a null/garbage price.';

-- Not a no-op: any recipe currently tagging a deal with
-- package_weight_g_source='estimated' (e.g. the chicken breast deal --
-- 700g is a guess, not read off the real package) gets
-- price_estimated: true in its deal_tags for the first time. No price
-- NUMBER changes, only this new flag.
select public.refresh_recipe_deal_tags();
