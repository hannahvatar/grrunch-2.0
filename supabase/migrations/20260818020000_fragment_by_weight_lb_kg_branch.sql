-- Real bug, caught auditing every recipe's deal-tagged ingredients
-- against its curated_deals row (Anabelle's "Rectifying a problem
-- that keeps on occuring" screenshots -- the Kraft Singles Mac &
-- Cheese card showing $2.58/serving "taking into account the
-- fragmentation" was the reference for what's SUPPOSED to happen
-- everywhere a recipe uses less than a full package).
--
-- compute_deal_tag_pricing()'s fragment_by_weight opt-in only ever
-- applied on the price_unit IN ('package', 'each') branch. The
-- lb/kg/100g branch (a real per-weight FLYER RATE, e.g. "$6.79/lb")
-- had no fragmentation concept at all -- its own comment claimed
-- "already reflects real proportional weight-based pricing, no
-- separate fragmentation concept needed", but that's only true when
-- package_weight_g is unknown. The moment package_weight_g IS known,
-- effective_weight_g prefers it over the ingredient's own stated
-- gram amount (coalesce(p_package_weight_g, ...)) -- so tag_price
-- AND tag_contribution both silently priced the FULL assumed package
-- weight, never the actual amount the recipe uses, with no
-- fragment_by_weight escape valve to fix it.
--
-- Found live: Prime chicken breast ($6.79/lb, package_weight_g 700 g
-- estimated) is used at 230 g in Boursin-Me-Up Chicken & Mushroom
-- Rice and 280 g in Honey Garlic Chicken Noodle Toss -- both charged
-- the full ~700 g package cost (~$10.48) toward price/serving despite
-- using a third to 40% of that. Setting fragment_by_weight=true on
-- the deal (already done, prior to this migration) had zero effect
-- until this fix landed.
--
-- Fix: badge numbers (tag_price/tag_original_price) are UNCHANGED --
-- still the full effective_weight_g cost, so the badge still never
-- contradicts the deal's own thumbnail. Only tag_contribution now
-- fragments, same opt-in gate as the package/each branch (fragment_by_
-- weight explicitly true AND package_weight_g known AND the recipe
-- states a real gram quantity) -- scaled off the ingredient's own
-- ing_ua.amount grams against the real per-gram rate instead of the
-- package's assumed total weight.
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
  p_ing_name text
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

    -- 'package'-only override: an each-count quantity might mean "N
    -- items out of one bag", not "N bags" -- check the avg-weight
    -- bridge before trusting the raw count as a package multiplier.
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
  -- tag_price/tag_original_price (badge display) always reflect the
  -- full effective_weight_g (the real package, when known -- see
  -- comment above) so the badge stays "buy the whole package" honest.
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

  -- Same opt-in fragmentation gate as the package/each branch above,
  -- scaled off the real per-gram rate instead of a package-fraction
  -- ratio (there's no flat package price on this branch to fraction).
  if coalesce(p_fragment_by_weight, false) and p_package_weight_g is not null and ing_ua.base_unit = 'g' then
    tag_contribution := round(p_price * (ing_ua.amount / grams_per_unit), 2);
  else
    tag_contribution := tag_price;
  end if;

  return next;
  return;
end;
$$;

comment on function public.compute_deal_tag_pricing(numeric, numeric, public.deal_price_unit, numeric, text, boolean, boolean, text, text, text) is
  'Computes tag_price/tag_original_price (ALWAYS the real, flat/full-package numbers shown on the deal-tag badge -- never fragmented, so the badge never contradicts the deal''s own thumbnail) plus a separate tag_contribution (what actually counts toward the recipe''s price-per-serving total, never displayed directly). For package/each deals, the flat price is multiplied by a package_count -- normally the ingredient''s raw each-count (correct for ''each'', where the flyer price is genuinely per single item), but for price_unit=''package'' with a count > 1, first checks whether the ingredient name has a staple_avg_weights bridge (e.g. peppers, onions): if so, converts the count to grams and computes the real number of WHOLE packages that requires (ceil(grams / package_weight_g)) instead of assuming the count itself is a package multiplier -- fixes a real bug where "7 peppers" against a $6 bag priced 7x too high. For lb/kg/100g deals, tag_price scales the real flyer rate against effective_weight_g (the known package_weight_g when set, else the recipe''s own stated grams) -- same "buy the assumed package" badge philosophy as package/each. On BOTH branches, tag_contribution equals tag_price UNLESS fragment_by_weight is explicitly true for this deal AND a real package_weight_g is known AND the recipe states a real gram quantity, in which case it''s fragmented proportionally to the recipe''s actual gram usage -- fragment_by_weight defaults false and must be explicitly opted into per deal, but per Anabelle''s standing rule is the expected default whenever a recipe genuinely uses less than the full package (20260818_fragment_by_weight_default memory). tag_quantity_estimated/tag_price_estimated describe the BADGE numbers'' own uncertainty, unrelated to fragmentation. Shared by both passes of refresh_recipe_deal_tags() so a future fix only has to land once.';

select public.refresh_recipe_deal_tags();
select public.refresh_recipe_nutrition();
