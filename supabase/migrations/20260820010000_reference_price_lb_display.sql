-- Anabelle, reviewing the dev-deals.tsx reference-price hint card
-- (Split Chicken Breast: flyer says "$3.99/LB", the card said "$17.34
-- / per kilogram"): "add price per lbs in the reference statcan
-- price... right now in kilo only i prefer lbs". Every BC flyer prices
-- meat/produce per lb, never per kg -- comparing against a kg figure
-- means doing the conversion in her head every single time.
--
-- Scope: statcan_reference_prices is the only one of the 3 reference
-- tables that stores a genuine per-unit-weight RATE as its own literal
-- string 'per kilogram' (25 rows -- meats and whole-item produce, e.g.
-- Chicken breast, Ground beef, Apples; confirmed by inspecting every
-- row using that exact unit string). Every other unit string across
-- all 3 tables (e.g. "500 grams", "1.36 kilograms", "2 litres") is a
-- PACKAGE size, not a rate -- avg_price there is the total price for
-- that whole package, not a per-kg figure, so converting those to a
-- $/lb rate would need a different calculation (divide by the
-- package's own weight) and isn't what was asked. Only the literal
-- 'per kilogram' rate is touched here.
--
-- A pure unit conversion of an already-real number (1 kg = 2.2046226218
-- lb) -- not a new/fabricated data point, same distinction drawn for
-- the avocado per-lb question earlier this session (StatCan genuinely
-- doesn't publish a per-lb avocado figure at all, so that one couldn't
-- be done this way; this one can, since the underlying $/kg number is
-- real).
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

  if best_words > 0 then
    -- Only 'per kilogram' is a genuine rate (see the comment above) --
    -- convert it to the $/lb figure Anabelle actually wants to compare
    -- against a flyer's own per-lb price.
    if result_unit = 'per kilogram' then
      result_price := round(result_price / 2.2046226218, 2);
      result_unit := 'lb';
    end if;
    return next;
  end if;
  return;
end;
$$;

comment on function public.find_reference_price(text) is
  'Read-only informational lookup for app/app/dev-deals.tsx: given a curated_deals.item_name, finds the best-matching statcan/produce/staple reference price (same word-subset matching convention as refresh_recipe_deal_tags()''s own staple-fallback block, but standalone -- no quantity scaling, since there''s no recipe quantity to scale against here, and no pasta-shape aliasing either). All three tiers are checked unconditionally and the single MOST SPECIFIC (highest word-count) match across all of them wins, ties broken by tier order (statcan -> produce -> staple). A statcan match stored as ''per kilogram'' is converted to a $/lb rate before returning (20260820, Anabelle: "i prefer lbs") -- every other reference unit is a package-total price, not a rate, and is returned as-is. Returns zero rows when nothing matches, which is expected/common for branded packaged goods that these reference tables don''t cover at all.';
