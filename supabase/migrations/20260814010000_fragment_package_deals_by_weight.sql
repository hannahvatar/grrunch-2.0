-- Anabelle, after finding both "Fast Food Fakeout — Big Mac Combo" and
-- "French Fry Sandwich" charging a full flat package price for a recipe
-- using only a fraction of it: "what is the point of this app" if the
-- shown cost-per-serving doesn't reflect what a recipe actually uses.
-- Real, valid concern -- and a genuine gap, not a one-off data mistake.
--
-- Root cause: curated_deals.package_weight_g (the real weight of a
-- package, e.g. 907g for Compliments Burgers & More, confirmed straight
-- off the flyer photo) has ALWAYS been captured, but compute_deal_tag_
-- pricing only ever used it for weight-RATE deals (price_unit lb/kg/
-- 100g) -- for 'package'/'each'-priced deals it was completely ignored,
-- always charging the flat listed price once, no matter how small a
-- fraction of the package the recipe's own ingredient line states. So
-- even after going to the trouble of finding Compliments Burgers' real
-- 907g weight, it was only ever used for nutrition scaling (the
-- staple_avg_weights bridge), never for price.
--
-- Fix: when a package/each-priced deal has a known package_weight_g AND
-- the recipe states a real gram quantity for it (not "1 package"/"2
-- packages", which should still charge the flat per-package price as
-- before -- that's an intentional whole-package purchase, not a
-- fragment), scale the price proportionally: recipe_grams /
-- package_weight_g. Same tag_price_estimated honesty flag already used
-- for weight-rate deals -- true whenever the weight itself is a guess
-- (package_weight_g_source = 'estimated'), same as Compliments Burgers &
-- More (907g, real, source 'label') vs McCain Superfries (650g, a
-- guessed single-bag midpoint of the flyer's own 454-800g bundled range,
-- source 'estimated').
--
-- Deliberately narrow: package_weight_g is null for the vast majority of
-- existing curated_deals rows (never backfilled), so this is a true
-- no-op for every recipe except the two that surfaced the gap -- see
-- this migration's own verification query.

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
    if p_package_weight_g is not null and ing_ua.base_unit = 'g' then
      -- A real package weight is known AND the recipe states a real
      -- gram amount for it -- fragment proportionally instead of always
      -- charging the flat whole-package price.
      tag_price := round(p_price * (ing_ua.amount / p_package_weight_g), 2);
      tag_original_price := round(p_original_price * (ing_ua.amount / p_package_weight_g), 2);
      tag_quantity_estimated := p_quantity_estimated;
      tag_price_estimated := p_package_weight_g_source = 'estimated';
      return next;
      return;
    end if;

    -- Unchanged from every prior version of this logic: credit the
    -- flat price once per whole package the recipe's stated
    -- quantity/unit calls for -- never fragmented. Still correct here:
    -- either package_weight_g is unknown (nothing to fragment against),
    -- or the recipe genuinely states "1 package"/"2 packages" (a real
    -- whole-package purchase, not a fragment).
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
  tag_price_estimated := p_package_weight_g is not null and p_package_weight_g_source = 'estimated';
  return next;
end;
$$;

comment on function public.compute_deal_tag_pricing(numeric, numeric, public.deal_price_unit, numeric, text, boolean, text, text) is
  'Computes the real tag_price/tag_original_price/tag_quantity_estimated/tag_price_estimated for one deal-tag match, branching on the deal''s price_unit. package/each: flat price x package_count UNLESS a real package_weight_g is known and the recipe states a real gram quantity, in which case it fragments proportionally (recipe_grams / package_weight_g) and flags tag_price_estimated when the weight itself was a guess. lb/kg/100g: scaled by package_weight_g (or, if null, by the recipe ingredient''s own weight) instead of credited raw. Shared by both passes of refresh_recipe_deal_tags() so a future fix only has to land once.';

-- Real package weights, so the fragmentation above actually engages for
-- the two recipes that surfaced this gap. Both curated_deals rows for
-- each product (duplicated across sync runs) updated for consistency.
update public.curated_deals
  set package_weight_g = 907, package_weight_g_source = 'label'
  where item_name ilike '%compliments burgers%';

update public.curated_deals
  set package_weight_g = 650, package_weight_g_source = 'estimated'
  where item_name ilike '%mccain superfries%';

select public.refresh_recipe_deal_tags();
select public.refresh_recipe_nutrition();
