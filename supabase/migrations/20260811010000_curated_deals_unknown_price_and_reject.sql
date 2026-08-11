-- Reviewing a deal's pricing (app/app/dev-deals.tsx) sometimes surfaces
-- a deal that shouldn't be priced at all yet -- the cutout photo
-- doesn't show a clear enough price, or it turns out not to be a real
-- deal worth keeping live. Price/original_price need to accept
-- "genuinely unknown" (not just left at whatever was last scraped),
-- and the reviewer needs a one-click way to reject the deal outright
-- from the same screen, rather than only being able to fix numbers.
--
-- CHECK constraints (price >= 0, original_price >= 0) and the
-- discount_pct generated column already tolerate NULL correctly under
-- normal SQL null-propagation semantics (a NULL comparison never
-- fails a CHECK; discount_pct's CASE falls through/nulls out cleanly)
-- -- no changes needed to either, just dropping the NOT NULL
-- constraints below.
alter table public.curated_deals
  alter column price drop not null,
  alter column original_price drop not null;

comment on column public.curated_deals.price is
  'Null means genuinely unknown -- not yet confirmed via app/app/dev-deals.tsx pricing review (the cutout photo is unclear, or pricing simply hasn''t been reviewed yet). A null-priced deal is never tagged onto a recipe (compute_deal_tag_pricing() returns null for it, same as an unscalable weight -- see that function) until resolved.';
comment on column public.curated_deals.original_price is
  'Null means genuinely unknown -- same handling as price, see its comment.';

-- compute_deal_tag_pricing() needs an explicit early-out for a null
-- price/original_price -- without it, the lb/kg/100g branch's
-- arithmetic (p_price * ...) would silently produce a NULL tag_price
-- anyway, but only reached after doing the (pointless) unit-parsing
-- work first. An explicit check up front is clearer and cheaper.
create or replace function public.compute_deal_tag_pricing(
  p_price numeric,
  p_original_price numeric,
  p_price_unit public.deal_price_unit,
  p_package_weight_g numeric,
  p_quantity_estimated boolean,
  p_ing_quantity text,
  p_ing_unit text
) returns table (tag_price numeric, tag_original_price numeric, tag_quantity_estimated boolean)
language plpgsql
as $$
declare
  ing_ua public.unit_amount;
  package_count numeric;
  grams_per_unit numeric;
  effective_weight_g numeric;
begin
  if p_price is null or p_original_price is null then
    -- Genuinely unknown pricing (see the comments on
    -- curated_deals.price/original_price) -- treat exactly like an
    -- unscalable weight below: no computable price, caller falls
    -- through to the staple-reference fallback instead of tagging a
    -- deal with a missing/garbage price.
    tag_price := null;
    tag_original_price := null;
    tag_quantity_estimated := null;
    return next;
    return;
  end if;

  ing_ua := public.parse_unit_amount(p_ing_quantity, p_ing_unit);

  if p_price_unit in ('package', 'each') then
    -- Unchanged from every prior version of this logic: credit the
    -- flat price once per whole package the recipe's stated
    -- quantity/unit calls for -- never fragmented.
    package_count := case
      when ing_ua.base_unit = 'each' and ing_ua.amount is not null and ing_ua.amount > 1
        then ing_ua.amount
      else 1
    end;
    tag_price := round(p_price * package_count, 2);
    tag_original_price := round(p_original_price * package_count, 2);
    tag_quantity_estimated := p_quantity_estimated;
    return next;
    return;
  end if;

  -- price_unit is lb/kg/100g: p_price is a RATE, not a package total.
  -- Mirrors app/lib/unitConversion.ts's parseUnitAmount() conversion
  -- table exactly (lb=453.592g, kg=1000g) -- keep these in sync if
  -- either ever changes.
  grams_per_unit := case p_price_unit
    when 'lb' then 453.592
    when 'kg' then 1000
    when '100g' then 100
  end;

  -- A labeled grab-and-go package (chicken breasts: package_weight_g
  -- set, even if only estimated) uses that fixed weight -- you're
  -- buying one whole package regardless of the recipe's own quantity,
  -- same never-fragment principle as the package/each branch above.
  -- Genuinely bulk/loose produce (zucchini: package_weight_g null) has
  -- no "one package" to buy -- scale the rate directly against however
  -- much THIS recipe calls for instead, the same math
  -- scale_reference_price() already uses for staple ingredients.
  effective_weight_g := coalesce(
    p_package_weight_g,
    case when ing_ua.base_unit = 'g' then ing_ua.amount else null end
  );

  if effective_weight_g is null then
    -- Can't scale a per-weight rate against an unparseable/non-weight
    -- recipe quantity (e.g. "to taste") -- leave the gap visible
    -- (caller falls through to the staple-reference fallback) rather
    -- than invent a number, same policy scale_reference_price() uses.
    tag_price := null;
    tag_original_price := null;
    tag_quantity_estimated := null;
    return next;
    return;
  end if;

  tag_price := round(p_price * (effective_weight_g / grams_per_unit), 2);
  tag_original_price := round(p_original_price * (effective_weight_g / grams_per_unit), 2);
  -- Bulk (no fixed package weight) is inherently an estimate regardless
  -- of what the curator flagged; a labeled package still respects her
  -- own quantity_estimated call.
  tag_quantity_estimated := p_quantity_estimated or (p_package_weight_g is null);
  return next;
end;
$$;

-- Reject an unknown/no-longer-good deal immediately (status='rejected'
-- already excludes it from refresh_recipe_deal_tags(), which only
-- ever selects status='approved' rows -- both passes, unchanged) --
-- picks up whatever price/quantity edits were made in the same save.
select public.refresh_recipe_deal_tags();
