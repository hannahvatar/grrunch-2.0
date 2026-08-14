-- Found while adding "Fast Food Fakeout — Big Mac"'s Mayonnaise: the
-- ingredient's "$X avg." price rendered as $0.00. Root cause -- StatCan's
-- "Mayonnaise" reference is priced "890 millilitres" (spelled out, not
-- abbreviated "890 mL"), and parse_unit_amount() checks the litre branch
-- BEFORE the millilitre branch. "millilitre" contains "litre" as a
-- substring, so "890 millilitres" matched the litre branch first and got
-- treated as 890 LITRES (*1000 -> 890,000 mL) -- a 1000x error that
-- rounds any computed price down to $0.00. This is the exact same
-- relationship as kilogram/gram just above it in the same if-chain
-- ("kilogram" contains "gram"), which IS correctly ordered specific-first
-- -- litre/millilitre was simply backwards.
--
-- 14 rows across staple_reference_prices (3) and statcan_reference_prices
-- (11) use this spelled-out "NNN millilitres" unit and had the identical
-- bug: Salad dressing, Canned tomatoes (both tables), Canned beans and
-- lentils (both tables), Mayonnaise, Canned baked beans, Canned soup,
-- Canned corn, Canned peach, Canned pear, Salsa, Pasta sauce. None of
-- these are used by name in any currently-live recipe except Mayonnaise
-- (this one), so this is expected to be a true no-op for every other
-- recipe -- verified below.
--
-- Client-side twin: app/lib/unitConversion.ts's parseUnitAmount(), fixed
-- in the same commit as this migration.

create or replace function public.parse_unit_amount(quantity text, unit_text text)
returns public.unit_amount
language plpgsql
as $$
declare
  qty_text text := trim(coalesce(quantity, ''));
  qty numeric;
  frac_match text[];
  t text := lower(trim(coalesce(unit_text, '')));
  num numeric;
  result public.unit_amount;
  paren_match text[];
  paren_num numeric;
  paren_unit text;
begin
  if qty_text = '' then
    qty := 1;
  elsif qty_text ~ '^\d+\s*/\s*\d+$' then
    frac_match := regexp_match(qty_text, '^(\d+)\s*/\s*(\d+)$');
    qty := frac_match[1]::numeric / frac_match[2]::numeric;
  elsif qty_text ~ '^\d+(\.\d+)?$' then
    qty := qty_text::numeric;
  else
    qty := null;
  end if;

  paren_match := regexp_match(t, '\(\s*([\d.]+)\s*(kilograms?|kg|grams?|gr|g|litres?|liters?|l|millilitres?|milliliters?|ml)\s*\)');
  if paren_match is not null then
    paren_num := paren_match[1]::numeric;
    paren_unit := paren_match[2];
    if paren_unit ~ '^(kilograms?|kg)$' then
      result.amount := coalesce(qty, 1) * paren_num * 1000; result.base_unit := 'g';
    elsif paren_unit ~ '^(litres?|liters?|l)$' then
      result.amount := coalesce(qty, 1) * paren_num * 1000; result.base_unit := 'ml';
    elsif paren_unit ~ '^(millilitres?|milliliters?|ml)$' then
      result.amount := coalesce(qty, 1) * paren_num; result.base_unit := 'ml';
    else
      result.amount := coalesce(qty, 1) * paren_num; result.base_unit := 'g';
    end if;
    return result;
  end if;

  if t like 'per %' then
    t := substring(t from 5);
    num := 1;
  else
    num := (regexp_match(t, '^([\d.]+)'))[1]::numeric;
    num := coalesce(num, 1) * qty;
  end if;

  if t ~ 'kilogram|\ykg\y' then
    result.amount := num * 1000; result.base_unit := 'g';
  elsif t ~ 'gram|\ygr\y|\yg\y' then
    result.amount := num; result.base_unit := 'g';
  elsif t ~ 'pound|\ylb\y|\ylbs\y' then
    result.amount := num * 453.592; result.base_unit := 'g';
  elsif t ~ 'ounce|\yoz\y' then
    result.amount := num * 28.3495; result.base_unit := 'g';
  -- millilitre MUST be checked before litre -- see migration comment above.
  elsif t ~ 'millilitre|milliliter|\yml\y' then
    result.amount := num; result.base_unit := 'ml';
  elsif t ~ 'litre|liter|\yl\y' then
    result.amount := num * 1000; result.base_unit := 'ml';
  elsif t ~ 'tablespoon|\ytbsp\y' then
    result.amount := num * 14.7868; result.base_unit := 'ml';
  elsif t ~ 'teaspoon|\ytsp\y' then
    result.amount := num * 4.92892; result.base_unit := 'ml';
  elsif t ~ 'cup' then
    result.amount := num * 236.588; result.base_unit := 'ml';
  elsif t ~ 'dozen' then
    result.amount := num * 12; result.base_unit := 'each';
  elsif t ~ 'clove' then
    result.amount := num / 10; result.base_unit := 'each';
  elsif t ~ 'stalk' then
    result.amount := num / 8; result.base_unit := 'each';
  else
    result.amount := num; result.base_unit := 'each';
  end if;

  return result;
end;
$$;

comment on function public.parse_unit_amount(text, text) is
  'Parses a recipe/reference quantity+unit pair into a normalized {amount, base_unit} (g/ml/each). Checks for a parenthetical weight/volume hint first ("block (200g)" -> 200g), then plain unit keywords -- millilitre before litre and kilogram before gram (both specific-before-generic, since each generic name is a substring of its specific counterpart) -- including clove (1/10 bulb) and stalk (1/8 bunch) as sub-units of their reference''s own whole-unit denomination. Unrecognized units with no parenthetical hint fall to base_unit=''each'', amount=the parsed leading number (or 1).';

select public.refresh_recipe_deal_tags();
select public.refresh_recipe_nutrition();
