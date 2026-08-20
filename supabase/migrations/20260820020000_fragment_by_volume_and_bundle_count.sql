-- Extends fragment_by_weight to two more real shapes it never covered:
-- a VOLUME-measured package (a bottle, mL-denominated -- tbsp/tsp/cup
-- recipe quantities all parse to base_unit 'ml', not 'g', so the
-- existing gram-only fragment check never engaged for them at all), and
-- a real multi-buy BUNDLE priced as one each-unit (price_unit='each')
-- where the recipe uses fewer than the bundle's own real count.
--
-- Anabelle, reviewing Wok This Way Hoisin Pork's servings stepper:
-- "A bottle of hoisin is 445 ml i doubt that 2 4 tbs requires 2
-- bottles." -- confirmed: fragment_by_weight was already true-eligible
-- in spirit for this deal, but compute_deal_tag_pricing()'s fragment
-- gate only ever checked `ing_ua.base_unit = 'g'`, so a tbsp-quantity
-- ingredient (base_unit 'ml') could never fragment no matter what --
-- same architecture gap as the cups-vs-grams rice bug fixed earlier
-- this session, just never generalized past grams.
--
-- Anabelle, on the Green Onions deal (a real "2 bunches for $3" flyer
-- promo, previously stored here as price=1.50/price_unit='each' -- an
-- ASSUMED single-bunch price, not a real one): "Green onion are 2 for
-- 3. I dont know how much is one we cant assume its 1.5. Write 3 but
-- say recipe uses 1 bunch and account for 1.5 in your costs per
-- serving." The real printed number is $3 for the bundle -- the badge
-- (tag_price) must show that, not a guessed per-unit split, while the
-- recipe's own price/serving (tag_contribution) still needs to credit
-- only the real half-share ($1.50) a 1-bunch recipe actually uses. The
-- existing gram/weight fragment mechanism has no concept of "a bundle
-- of N each-priced units" at all -- new bundle_count column needed.

alter table public.curated_deals
  add column bundle_count integer,
  add column package_volume_ml numeric;

comment on column public.curated_deals.bundle_count is
  'Set only for a price_unit=''each'' deal whose real flyer promo is a multi-buy bundle (e.g. "2 bunches for $3", bundle_count=2) rather than a genuine single-unit rate. Paired with fragment_by_weight=true so compute_deal_tag_pricing() can credit a recipe using fewer than the bundle count its real fractional share (tag_contribution) while the badge (tag_price) still shows the real bundle price, never a guessed per-unit split. Null for every other deal.';
comment on column public.curated_deals.package_volume_ml is
  'The mL counterpart to package_weight_g, for a deal item genuinely measured/purchased by volume (a bottle, jar, carton) rather than weight -- e.g. Lee Kum Kee Hoisin Sauce, 445 mL. Paired with fragment_by_weight=true so compute_deal_tag_pricing() can fragment a tbsp/tsp/cup/mL recipe quantity against the real bottle size, the same way package_weight_g already does for a gram quantity against a real package weight. Null when genuinely unknown or not volume-denominated.';

drop function if exists public.compute_deal_tag_pricing(
  numeric, numeric, public.deal_price_unit, numeric, text, boolean, boolean, text, text, text
);

create or replace function public.compute_deal_tag_pricing(
  p_price numeric,
  p_original_price numeric,
  p_price_unit public.deal_price_unit,
  p_package_weight_g numeric,
  p_package_weight_g_source text,
  p_fragment_by_weight boolean,
  p_quantity_estimated boolean,
  p_ing_quantity text,
  p_ing_unit text,
  p_ing_name text,
  p_bundle_count integer,
  p_package_volume_ml numeric
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
  ing_words text[];
  avg_weight numeric;
  avg_weight_words text[];
  bridged_grams numeric;
  grams_per_unit numeric;
  effective_weight_g numeric;
  p_original_price_eff numeric;
begin
  if p_price is null then
    tag_price := null;
    tag_original_price := null;
    tag_quantity_estimated := null;
    tag_price_estimated := null;
    tag_contribution := null;
    return next;
    return;
  end if;

  -- No printed "reg. $X" on the flyer -- an honest, common case, not a
  -- data gap. Falling back to p_price itself makes discount_pct compute
  -- to a clean 0 (shown app-side as "Fair price", not a phantom badge)
  -- instead of silently dropping the whole deal-tag contribution.
  p_original_price_eff := coalesce(p_original_price, p_price);

  ing_ua := public.parse_unit_amount(p_ing_quantity, p_ing_unit);

  if p_price_unit in ('package', 'each') then
    package_count := case
      when ing_ua.base_unit = 'each' and ing_ua.amount is not null and ing_ua.amount > 1
        then ing_ua.amount
      else 1
    end;

    if p_price_unit = 'package' and package_count > 1 and p_package_weight_g is not null then
      ing_words := public.normalize_words(p_ing_name);
      bridged_grams := null;
      for avg_weight, avg_weight_words in
        select w.grams_each, public.normalize_words(w.ingredient_name)
        from public.staple_avg_weights w
      loop
        if array_length(avg_weight_words, 1) > 0 and avg_weight_words <@ ing_words then
          bridged_grams := ing_ua.amount * avg_weight;
          exit;
        end if;
      end loop;

      if bridged_grams is not null then
        package_count := ceil(bridged_grams / p_package_weight_g);
      end if;
    end if;

    -- tag_price/tag_original_price: ALWAYS the real, flat/full package
    -- (or bundle) numbers shown on the badge -- never fragmented here,
    -- so the badge never contradicts the deal's own thumbnail/flyer
    -- price. Unchanged by everything below.
    tag_price := round(p_price * package_count, 2);
    tag_original_price := round(p_original_price_eff * package_count, 2);
    tag_quantity_estimated := p_quantity_estimated;
    tag_price_estimated := false;

    -- tag_contribution: what actually counts toward the recipe's own
    -- price/serving. Equals tag_price UNLESS this deal is explicitly
    -- opted into fragmented pricing (fragment_by_weight) AND the
    -- recipe's ingredient quantity is a genuine sub-unit of one whole
    -- real-world package/bottle/bundle -- three shapes, each gated on
    -- its own matching ing_ua.base_unit so they're naturally mutually
    -- exclusive:
    --  - WEIGHT (g): a sub-package gram quantity against a known
    --    package_weight_g (e.g. 240 g rice out of a 4540 g bag).
    --  - VOLUME (ml): a sub-bottle tbsp/tsp/cup/mL quantity against a
    --    known package_volume_ml (e.g. 2 tbsp hoisin sauce out of a
    --    445 mL bottle).
    --  - BUNDLE COUNT (each): a real multi-buy bundle (price_unit=
    --    'each', a bundle_count > 1) where the recipe uses fewer than
    --    the bundle's own real count (e.g. 1 of "2 bunches for $3").
    if coalesce(p_fragment_by_weight, false) and p_package_weight_g is not null and ing_ua.base_unit = 'g' then
      tag_contribution := round(p_price * (ing_ua.amount / p_package_weight_g), 2);
    elsif coalesce(p_fragment_by_weight, false) and p_package_volume_ml is not null and ing_ua.base_unit = 'ml' then
      tag_contribution := round(p_price * (ing_ua.amount / p_package_volume_ml), 2);
    elsif coalesce(p_fragment_by_weight, false) and p_bundle_count is not null and p_bundle_count > 0
          and ing_ua.base_unit = 'each' and ing_ua.amount < p_bundle_count then
      tag_contribution := round(p_price * (ing_ua.amount / p_bundle_count), 2);
    else
      tag_contribution := tag_price;
    end if;

    return next;
    return;
  end if;

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
  tag_original_price := round(p_original_price_eff * (effective_weight_g / grams_per_unit), 2);
  tag_quantity_estimated := p_quantity_estimated or (p_package_weight_g is null);
  tag_price_estimated := p_package_weight_g is not null and p_package_weight_g_source = 'estimated';

  if coalesce(p_fragment_by_weight, false) and p_package_weight_g is not null and ing_ua.base_unit = 'g' then
    tag_contribution := round(p_price * (ing_ua.amount / grams_per_unit), 2);
  else
    tag_contribution := tag_price;
  end if;

  return next;
  return;
end;
$$;

comment on function public.compute_deal_tag_pricing(numeric, numeric, public.deal_price_unit, numeric, text, boolean, boolean, text, text, text, integer, numeric) is
  'Computes tag_price/tag_original_price (ALWAYS the real, flat/full-package or full-bundle numbers shown on the deal-tag badge -- never fragmented, so the badge never contradicts the deal''s own thumbnail/flyer price) plus a separate tag_contribution (what actually counts toward the recipe''s price-per-serving total, never displayed directly). Only p_price is required. For package/each deals, the flat price is multiplied by a package_count (the ingredient''s raw each-count, bridged via staple_avg_weights for a ''package''-priced multi-count item). tag_contribution equals tag_price UNLESS fragment_by_weight is true AND the recipe''s ingredient quantity is a genuine sub-unit of a known real package -- three shapes (20260820, extending the original gram-only version): by WEIGHT (g, against package_weight_g), by VOLUME (ml, against package_volume_ml -- Anabelle: "a bottle of hoisin is 445 ml i doubt that 2 4 tbs requires 2 bottles"), or by BUNDLE COUNT (each, against bundle_count, for a real multi-buy like "2 bunches for $3" -- Anabelle: "Write 3 but say recipe uses 1 bunch and account for 1.5 in your costs per serving"). For lb/kg/100g deals, tag_price scales the real flyer rate against effective_weight_g (gram fragmentation only -- lb/kg/100g deals are already weight-denominated by definition). Shared by both passes of refresh_recipe_deal_tags().';

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

      for deal in
        select id, item_name, chain_name, image_url, price, original_price, product_url,
               price_unit, package_weight_g, package_weight_g_source, fragment_by_weight,
               quantity_estimated, original_price_source, bundle_count, package_volume_ml
        from public.curated_deals
        where status = 'approved' and usage <> 'deals'
      loop
        deal_words := public.normalize_words(deal.item_name);
        if array_length(deal_words, 1) > 0 and deal_words <@ ing_words then
          select p.tag_price, p.tag_original_price, p.tag_quantity_estimated, p.tag_price_estimated, p.tag_contribution
            into tag_price, tag_original_price, tag_estimated, tag_price_estimated, tag_contribution
          from public.compute_deal_tag_pricing(
            deal.price, deal.original_price, deal.price_unit, deal.package_weight_g,
            deal.package_weight_g_source, deal.fragment_by_weight, deal.quantity_estimated,
            ing->>'quantity', ing->>'unit', ing->>'name',
            deal.bundle_count, deal.package_volume_ml
          ) p;

          if tag_price is null then
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
            'raw_price', deal.price,
            'raw_original_price', deal.original_price,
            'discount_pct', round((1 - tag_price / tag_original_price) * 100),
            'quantity_estimated', tag_estimated,
            'original_price_source', deal.original_price_source,
            'price_estimated', tag_price_estimated,
            'fragment_by_weight', deal.fragment_by_weight,
            'package_weight_g', deal.package_weight_g,
            'price_unit', deal.price_unit,
            'deal_item_name', deal.item_name,
            'bundle_count', deal.bundle_count,
            'package_volume_ml', deal.package_volume_ml
          );
          total := total + tag_contribution;
          exit;
        end if;
      end loop;

      if not matched then
        for deal in
          select id, item_name, chain_name, image_url, price, original_price, product_url, keyword_matches,
                 price_unit, package_weight_g, package_weight_g_source, fragment_by_weight,
                 quantity_estimated, original_price_source, bundle_count, package_volume_ml
          from public.curated_deals
          where status = 'approved' and usage <> 'deals'
            and keyword_matches is not null and array_length(keyword_matches, 1) > 0
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
              ing->>'quantity', ing->>'unit', ing->>'name',
              deal.bundle_count, deal.package_volume_ml
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
              'raw_price', deal.price,
              'raw_original_price', deal.original_price,
              'discount_pct', round((1 - tag_price / tag_original_price) * 100),
              'quantity_estimated', tag_estimated,
              'original_price_source', deal.original_price_source,
              'price_estimated', tag_price_estimated,
              'fragment_by_weight', deal.fragment_by_weight,
              'package_weight_g', deal.package_weight_g,
              'price_unit', deal.price_unit,
              'deal_item_name', deal.item_name,
              'bundle_count', deal.bundle_count,
              'package_volume_ml', deal.package_volume_ml
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
  'Rebuilds deal_tags and price for every recipe from scratch against the current curated_deals table, and used_in_recipe on curated_deals itself. Two full passes per ingredient (exact match, then keyword fallback), BOTH restricted to usage <> ''deals''. The staple-fallback tier (statcan -> produce -> staple) checks all three unconditionally and keeps the single MOST SPECIFIC (highest word-count) match across all of them. Each tag carries: name, deal_item_name, original_price_source, price_estimated, fragment_by_weight, package_weight_g, price_unit, bundle_count, package_volume_ml (20260820 -- see compute_deal_tag_pricing()''s own comment for what the last three do together), and raw_price/raw_original_price. The staple-fallback tier honors an optional per-ingredient price_quantity/price_unit override.';

-- Real data corrections, not just schema -- both deliberately narrow,
-- single-row fixes for the two cases Anabelle actually flagged, not a
-- blanket policy change:
--   Green Onions (Save-On-Foods): was price=1.50/price_unit='each', an
--   ASSUMED half-of-$3 single-bunch rate with no real printed price
--   behind it. Restored to the real flyer number ($3, price_unit=
--   'package', matching how every other flat-bundle price is stored)
--   with bundle_count=2 so the badge shows the honest $3 while the
--   recipe's own price/serving still credits the correct $1.50 half-share.
update public.curated_deals
  set price = 3.00, price_unit = 'package', bundle_count = 2, fragment_by_weight = true
  where item_name = 'Green Onions' and chain_name = 'Save-On-Foods';

--   Lee Kum Kee Hoisin Sauce (Safeway): real bottle size, 445 mL --
--   confirmed via the product's own listed size. fragment_by_weight
--   opted in so a 2 tbsp/4 tbsp recipe quantity (well under one bottle,
--   even at 2x batches) is credited its real fractional share instead
--   of the flat $3.48 bottle price.
update public.curated_deals
  set package_volume_ml = 445, fragment_by_weight = true
  where item_name = 'LEE KUM KEE Hoisin Sauce' and chain_name = 'Safeway';

-- Materialize immediately. Verify via a full before/after
-- recipes.price/calories/protein diff -- only Wok This Way Hoisin Pork
-- (Green Onions + Hoisin Sauce, both now fragmented) is expected to
-- change; every other recipe should be byte-identical.
select public.refresh_recipe_deal_tags();
