-- Two things Anabelle flagged about the previous migration's
-- fragmentation, both real:
--
-- 1. "Never break the rule of fragmenting package unless i say so" --
--    fragmentation silently applied to Souvlaki Street Bowl's chicken
--    kabobs, which she didn't want fragmented, purely because that deal
--    already had a real package_weight_g recorded (from earlier,
--    unrelated work) and the recipe happened to state a gram quantity.
--    Fix: fragment_by_weight, a new boolean on curated_deals (default
--    false), gates the proportional-pricing branch explicitly. No
--    combination of package_weight_g + a gram-quantity ingredient can
--    ever trigger it again without this flag being deliberately flipped
--    true for that specific deal.
--
-- 2. "It looks like we are telling the user that the whole package
--    what 1.54 and now down to 1.00. This fix is really not working" --
--    a real UX problem, not a math one. The deal-tag badge shows the
--    same flyer thumbnail/photo as every other deal (McCain's real
--    printed "$3.00", "SAVE 35%"), but right next to it the badge text
--    showed a FRAGMENTED number ($1.00/$1.54) nobody will ever see at
--    the store or on a receipt -- same visual language as a real flyer
--    price, but not one. Fix: the badge (tag_price/tag_original_price,
--    what's written into deal_tags and shown to the user) now ALWAYS
--    shows the real, flat, unfragmented flyer price -- fragmentation
--    only ever affects a new, separate tag_contribution value used
--    solely to compute the recipe's own price-per-serving total, never
--    displayed on the badge itself. A recipe can now have an honest,
--    lower total cost per serving without ever showing a price that
--    doesn't match what's actually printed on the flyer.

alter table public.curated_deals
  add column fragment_by_weight boolean not null default false;

comment on column public.curated_deals.fragment_by_weight is
  'Explicit per-deal opt-in for compute_deal_tag_pricing''s proportional pricing contribution on package/each deals -- false by default, even when package_weight_g is known. Anabelle''s standing rule (2026-08-14): never fragment a package''s cost contribution unless she explicitly asks for it on that specific deal. Flip true only when she confirms a specific recipe should count a fragmented (not flat) amount toward its price-per-serving total. Never affects what''s displayed on the deal-tag badge itself -- see compute_deal_tag_pricing''s comment.';

create or replace function public.compute_deal_tag_pricing(
  p_price numeric,
  p_original_price numeric,
  p_price_unit public.deal_price_unit,
  p_package_weight_g numeric,
  p_package_weight_g_source text,
  p_fragment_by_weight boolean,
  p_quantity_estimated boolean,
  p_ing_quantity text,
  p_ing_unit text
) returns table (
  tag_price numeric,
  tag_original_price numeric,
  tag_quantity_estimated boolean,
  tag_price_estimated boolean,
  tag_contribution numeric
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
    tag_contribution := null;
    return next;
    return;
  end if;

  ing_ua := public.parse_unit_amount(p_ing_quantity, p_ing_unit);

  if p_price_unit in ('package', 'each') then
    -- The badge (tag_price/tag_original_price) ALWAYS shows the real,
    -- flat, flyer-printed price -- unchanged regardless of fragmentation
    -- -- so it never contradicts the deal's own thumbnail/photo. Only
    -- tag_contribution (used solely for the recipe's own price-per-
    -- serving total, never shown to the user directly) fragments.
    package_count := case
      when ing_ua.base_unit = 'each' and ing_ua.amount is not null and ing_ua.amount > 1
        then ing_ua.amount
      else 1
    end;
    tag_price := round(p_price * package_count, 2);
    tag_original_price := round(p_original_price * package_count, 2);
    tag_quantity_estimated := p_quantity_estimated;
    tag_price_estimated := false;

    if coalesce(p_fragment_by_weight, false) and p_package_weight_g is not null and ing_ua.base_unit = 'g' then
      tag_contribution := round(p_price * (ing_ua.amount / p_package_weight_g), 2);
    else
      tag_contribution := tag_price;
    end if;

    return next;
    return;
  end if;

  -- price_unit is lb/kg/100g: p_price is a RATE, not a package total.
  -- Already reflects real proportional weight-based pricing (unlike the
  -- flat package/each price above), so tag_price IS the honest number
  -- here -- tag_contribution is always the same as tag_price, no
  -- separate fragmentation concept needed on this branch.
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
    tag_contribution := null;
    return next;
    return;
  end if;

  tag_price := round(p_price * (effective_weight_g / grams_per_unit), 2);
  tag_original_price := round(p_original_price * (effective_weight_g / grams_per_unit), 2);
  tag_quantity_estimated := p_quantity_estimated or (p_package_weight_g is null);
  tag_price_estimated := p_package_weight_g is not null and p_package_weight_g_source = 'estimated';
  tag_contribution := tag_price;
  return next;
end;
$$;

comment on function public.compute_deal_tag_pricing(numeric, numeric, public.deal_price_unit, numeric, text, boolean, boolean, text, text) is
  'Computes tag_price/tag_original_price (ALWAYS the real, flat, flyer-printed numbers shown on the deal-tag badge -- never fragmented, so the badge never contradicts the deal''s own thumbnail) plus a separate tag_contribution (what actually counts toward the recipe''s price-per-serving total, never displayed directly). For package/each deals, tag_contribution equals tag_price UNLESS fragment_by_weight is explicitly true for this deal AND a real package_weight_g is known AND the recipe states a real gram quantity, in which case it''s fragmented proportionally (recipe_grams / package_weight_g) -- fragment_by_weight defaults false and must be explicitly opted into per deal (Anabelle''s standing rule: never fragment unless she says so). For lb/kg/100g deals, tag_contribution always equals tag_price (already real proportional pricing, nothing to separate). tag_quantity_estimated/tag_price_estimated describe the BADGE numbers'' own uncertainty (a guessed package weight scaling a real per-lb rate), unrelated to fragmentation. Shared by both passes of refresh_recipe_deal_tags() so a future fix only has to land once.';

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
            ing->>'quantity', ing->>'unit'
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
          total := total + tag_contribution;
          exit;
        end if;
      end loop;

      -- Pass 2: keyword fallback -- only runs if pass 1 found nothing
      -- for this ingredient anywhere.
      if not matched then
        for deal in
          select item_name, chain_name, image_url, price, original_price, product_url, keyword_matches,
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
              ing->>'quantity', ing->>'unit'
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
  'Rebuilds deal_tags and price for every recipe from scratch against the current curated_deals table. Two full passes per ingredient, in order: (1) exact name match against every approved deal (deal_words <@ ing_words) -- always checked to completion first, so a real exact match can never lose to a keyword collision regardless of row order; (2) only if pass 1 found nothing, a human-curated keyword fallback -- matches if any of a deal''s keyword_matches phrases has all its words loosely present (singular/plural-tolerant) in the ingredient''s name. Per-match pricing is delegated to compute_deal_tag_pricing() -- see that function''s own comment for the price_unit branching and the tag_price/tag_contribution split (badge always shows the real flat price; the recipe''s own total uses tag_contribution, which only differs from tag_price when the deal has fragment_by_weight explicitly opted in). Each tag also carries original_price_source (''flyer'' vs. ''reference'') and price_estimated (true only when the tag''s dollar total was scaled by a GUESSED package weight, not a labeled/measured one) so display components can flag both kinds of uncertainty distinctly. A deal-tagged ingredient with no computable price (e.g. a bulk-rate deal matched to a recipe line with no parseable weight) falls through to the staple-reference fallback instead of being tagged with a null/garbage price. The staple-reference fallback tier (only, never deal-credit matching) runs both the ingredient''s AND every candidate reference row''s words through staple_alias_words() first, so a pasta-shape ingredient (Penne, Rigatoni, Macaroni, ...) with no dedicated reference row of its own can still match a generic "pasta" reference (or another shape''s own dedicated row, e.g. Spaghetti''s).';

-- Opt in only the one deal Anabelle has actually confirmed should
-- fragment its contribution to a recipe's total. Both curated_deals
-- rows for the product (duplicated across sync runs) updated for
-- consistency. Compliments Burgers & More and Marcangelo Chicken Breast
-- Souvlaki kabobs stay false -- both recipes already state a
-- whole-package quantity (907g/480g, matching each deal's own real
-- package_weight_g exactly), so nothing would change for them even if
-- opted in, but the flag is the real guarantee now, not the recipe's
-- own stated quantity.
update public.curated_deals
  set fragment_by_weight = true
  where item_name ilike '%mccain superfries%';

select public.refresh_recipe_deal_tags();
select public.refresh_recipe_nutrition();
