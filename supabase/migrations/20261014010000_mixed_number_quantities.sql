-- parse_unit_amount read "1 1/2" as no quantity at all, so any pantry
-- line written as a mixed number ("1 1/2 cups flour", "1 1/4 cups rice")
-- was left out of the recipe's price (Anabelle, 2026-10-14: flour and
-- frying oil unpriced in the Spicy Chicken Sandwich). Same function as
-- before with one added branch for mixed numbers; the app's twin is
-- parseQuantity in app/lib/unitConversion.ts.
CREATE OR REPLACE FUNCTION public.parse_unit_amount(quantity text, unit_text text)
 RETURNS unit_amount
 LANGUAGE plpgsql
AS $function$
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
  elsif qty_text ~ '^\d+\s+\d+\s*/\s*\d+$' then
    -- Mixed number ("1 1/2"), which recipes use for cups and tbsp.
    frac_match := regexp_match(qty_text, '^(\d+)\s+(\d+)\s*/\s*(\d+)$');
    qty := frac_match[1]::numeric + frac_match[2]::numeric / frac_match[3]::numeric;
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
$function$;
