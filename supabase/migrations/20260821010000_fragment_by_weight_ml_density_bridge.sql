-- compute_deal_tag_pricing()'s fragment_by_weight branches only ever
-- fragment when the recipe ingredient's own dimension already matches
-- the deal's: a gram quantity against package_weight_g, or an mL
-- quantity against package_volume_ml. A weight-denominated package
-- measured in the recipe by VOLUME (honey, sold "1 KG" but always used
-- in tbsp) fell through both checks straight to the flat, un-fragmented
-- tag_price -- found building Sticky Honey-Garlic Chicken Drumsticks:
-- "2 tbsp Honey" against a real $11.49/1kg deal charged the recipe the
-- full $11.49 jar price instead of the ~$0.50 a 2 tbsp share is
-- actually worth, nearly tripling the recipe's real price/serving.
--
-- New branch bridges an mL recipe quantity to grams via the same
-- staple_densities table scale_reference_price already uses for this
-- exact mL<->g conversion (same 236.588 mL/cup constant, same
-- word-subset density lookup), then fragments against package_weight_g
-- same as the existing gram branch. Deliberately ordered after the
-- existing package_volume_ml check (an exact-dimension match, when
-- available, is more precise than a density-bridged one) and only
-- engages when package_volume_ml is null, so a deal that already has a
-- real bottle/carton size keeps using it unchanged.
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
  alias_ing_words text[];
  deal_words text[];
  avg_weight numeric;
  avg_weight_words text[];
  bridged_grams numeric;
  density numeric;
  density_words text[];
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

    tag_price := round(p_price * package_count, 2);
    tag_original_price := round(p_original_price_eff * package_count, 2);
    tag_quantity_estimated := p_quantity_estimated;
    tag_price_estimated := false;

    if coalesce(p_fragment_by_weight, false) and p_package_weight_g is not null and ing_ua.base_unit = 'g' then
      tag_contribution := round(p_price * (ing_ua.amount / p_package_weight_g), 2);
    elsif coalesce(p_fragment_by_weight, false) and p_package_volume_ml is not null and ing_ua.base_unit = 'ml' then
      tag_contribution := round(p_price * (ing_ua.amount / p_package_volume_ml), 2);
    elsif coalesce(p_fragment_by_weight, false) and p_package_weight_g is not null and p_package_volume_ml is null
          and ing_ua.base_unit = 'ml' then
      -- New: mL recipe quantity against a weight-denominated package --
      -- bridge via staple_densities, same conversion scale_reference_price
      -- already uses (dry_equivalent_cups * grams_per_cup, cooked_ratio
      -- deliberately omitted -- fragment_by_weight items here are
      -- condiments/oils, never a cooked-yield grain).
      ing_words := public.normalize_words(p_ing_name);
      bridged_grams := null;
      for density, density_words in
        select d.grams_per_cup, public.normalize_words(d.ingredient_name)
        from public.staple_densities d
      loop
        if array_length(density_words, 1) > 0 and density_words <@ ing_words then
          bridged_grams := (ing_ua.amount / 236.588) * density;
          exit;
        end if;
      end loop;

      if bridged_grams is not null then
        tag_contribution := round(p_price * (bridged_grams / p_package_weight_g), 2);
      else
        tag_contribution := tag_price;
      end if;
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
  'Computes tag_price/tag_original_price (ALWAYS the real, flat/full-package or full-bundle numbers shown on the deal-tag badge -- never fragmented, so the badge never contradicts the deal''s own thumbnail/flyer price) plus a separate tag_contribution (what actually counts toward the recipe''s price-per-serving total, never displayed directly). Only p_price is required. For package/each deals, the flat price is multiplied by a package_count (the ingredient''s raw each-count, bridged via staple_avg_weights for a ''package''-priced multi-count item). tag_contribution equals tag_price UNLESS fragment_by_weight is true AND the recipe''s ingredient quantity is a genuine sub-unit of a known real package -- four shapes (20260821, adding the mL<->g density bridge to the original three): by WEIGHT (g, against package_weight_g), by VOLUME (ml, against package_volume_ml), by an mL recipe quantity bridged to grams via staple_densities against a weight-only package_weight_g (e.g. "2 tbsp Honey" against a "1 KG" jar), or by BUNDLE COUNT (each, against bundle_count, for a real multi-buy like "2 bunches for $3"). For lb/kg/100g deals, tag_price scales the real flyer rate against effective_weight_g (gram fragmentation only -- lb/kg/100g deals are already weight-denominated by definition). Shared by both passes of refresh_recipe_deal_tags().';

-- Materialize immediately. Verify via a full before/after
-- recipes.price/calories/protein diff -- only Sticky Honey-Garlic
-- Chicken Drumsticks (the recipe that surfaced this gap) is expected
-- to change; every other recipe should be byte-identical.
select public.refresh_recipe_deal_tags();
