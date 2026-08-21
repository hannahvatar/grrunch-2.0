-- Third instance of the same cross-dimension fragmentation gap (after
-- the mL<->g density bridge for honey/cilantro): a garlic clove parses
-- to a FRACTIONAL each-amount (parse_unit_amount's own "clove = 1/10
-- bulb" rule -- "3 cloves" becomes amount=0.3, base_unit='each'), not
-- grams at all, so the existing gram-fragmentation branch never
-- engages, and the bundle_count branch doesn't apply either (that one
-- is for N-of-M whole bundle units, not a fraction of one). A recipe
-- using "3 cloves" out of a real 3-bulb package was silently charged
-- the full flat package price regardless of package_weight_g/
-- fragment_by_weight -- caught auditing the catalog after Anabelle:
-- "the cost per serving ALWAYS TAKES ON THE FRAGMENTATION. IF BROKEN
-- EVERYWHERE FIX" -- flipping fragment_by_weight on ROOSTER Garlic
-- alone had no effect until this landed.
--
-- New branch bridges an 'each' recipe quantity (whole OR fractional,
-- e.g. "3 cloves" -> 0.3, "2 whole bulbs" -> 2) to grams via
-- staple_avg_weights -- the SAME table/lookup the package_count branch
-- above already uses for the opposite direction (each-count > 1 against
-- a package) -- then fragments against package_weight_g like the
-- existing gram branch. Ordered last among the fragment_by_weight
-- checks (most specific dimension matches -- g, ml, ml-via-density --
-- are tried first; this each-via-avg-weight bridge is the most
-- general/lossy of the four, so only reached when nothing more precise
-- applies).
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
    elsif coalesce(p_fragment_by_weight, false) and p_package_weight_g is not null
          and ing_ua.base_unit = 'each' and (p_bundle_count is null or p_bundle_count <= 0) then
      -- New: an each-based recipe quantity (whole or a fractional
      -- container sub-unit like a clove) against a weight-denominated
      -- package -- bridge via staple_avg_weights, same lookup as the
      -- package_count logic above.
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
        tag_contribution := round(p_price * (bridged_grams / p_package_weight_g), 2);
      else
        tag_contribution := tag_price;
      end if;
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
  'Computes tag_price/tag_original_price (ALWAYS the real, flat/full-package or full-bundle numbers shown on the deal-tag badge -- never fragmented) plus a separate tag_contribution (what actually counts toward the recipe''s price-per-serving total). tag_contribution equals tag_price UNLESS fragment_by_weight is true AND the recipe''s ingredient quantity is a genuine sub-unit of a known real package -- five shapes (20260821, adding the each<->g avg-weight bridge to the prior four): by WEIGHT (g, against package_weight_g), by VOLUME (ml, against package_volume_ml), by an mL quantity bridged to grams via staple_densities against a weight-only package_weight_g, by BUNDLE COUNT (each, against bundle_count, for a real multi-buy), or by an each-based quantity (whole or a fractional container sub-unit like a clove) bridged to grams via staple_avg_weights against package_weight_g when there is no bundle_count. For lb/kg/100g deals, tag_price scales the real flyer rate against effective_weight_g. Shared by both passes of refresh_recipe_deal_tags().';

select public.refresh_recipe_deal_tags();
