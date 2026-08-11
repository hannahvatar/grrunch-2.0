-- When reviewing a deal (app/app/dev-deals.tsx) with a confirmed price
-- but no known original/regular price, Anabelle asked whether there's
-- any way to check the item against StatCan/produce/staple reference
-- data to help judge deal vs. fair price vs. reject, rather than just
-- guessing or leaving it stuck at pending indefinitely. There wasn't
-- -- this adds a read-only lookup she can see on the review screen.
--
-- Deliberately a NEW, separate function rather than extracting/reusing
-- refresh_recipe_deal_tags()'s existing inline staple-matching block:
-- that block matches a RECIPE ingredient (already-parsed quantity/unit,
-- needs the match scaled to that quantity via scale_reference_price())
-- -- a different shape of problem than this one, which just wants a
-- flat "does this deal's name match any reference item, and if so
-- what's its average price/unit" with no quantity scaling at all
-- (curated_deals has no quantity to scale against). Touching the
-- existing, already-load-bearing pricing function for an unrelated
-- informational lookup wasn't worth the risk.
--
-- Same 3-tier fallback order and matching convention as that block
-- (normalize_words + word-subset containment, excluding a single
-- "fresh"/"frozen" word match, longest/most-specific match wins) for
-- consistency -- but note the match direction: the REFERENCE item's
-- words must be a subset of the DEAL's words (e.g. reference "Onions"
-- matches deal "No Name Yellow Onions 3lb bag"). This means it only
-- ever finds a match for deals whose flyer name happens to contain a
-- generic staple/produce term -- most branded/packaged goods (snacks,
-- prepared foods, etc.) genuinely have no entry in any of these three
-- tables and will never match. That's expected, not a bug: StatCan/
-- these reference tables track generic staples and produce, not
-- specific branded SKUs.
-- OUT parameter names deliberately avoid colliding with the reference
-- tables' own column names (avg_price, unit) -- plpgsql resolves a
-- bare column name inside an embedded SELECT against its own
-- same-named variable/OUT-parameter first, which throws "ambiguous"
-- once both exist (hit this literally while building it: the first
-- version named the OUT params avg_price/unit directly). result_price/
-- result_unit sidestep that entirely.
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
       and not (array_length(ref_words, 1) = 1 and ref.ingredient_name ~* '\y(fresh|frozen)\y')
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
         and not (array_length(ref_words, 1) = 1 and ref.ingredient_name ~* '\y(fresh|frozen)\y')
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
         and not (array_length(ref_words, 1) = 1 and ref.ingredient_name ~* '\y(fresh|frozen)\y')
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
  'Read-only informational lookup for app/app/dev-deals.tsx: given a curated_deals.item_name, finds the best-matching statcan/produce/staple reference price (same 3-tier fallback + word-subset matching convention as refresh_recipe_deal_tags()''s own staple-fallback block, but standalone -- no quantity scaling, since there''s no recipe quantity to scale against here). Returns zero rows when nothing matches, which is expected/common for branded packaged goods that these reference tables don''t cover at all.';
