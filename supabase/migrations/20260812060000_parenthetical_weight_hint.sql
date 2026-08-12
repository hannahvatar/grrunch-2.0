-- Found while adding "TikTok Baked Feta Pasta (Tofu Upgrade)": ingredient
-- units like "block (200g)" / "block (350g)" -- Anabelle's own natural
-- phrasing, and the exact style already used elsewhere in this recipe's
-- own "Cans (155g Each)" wording -- silently priced/nutrition'd at $0.
-- Confirmed directly: scale_reference_price('1', 'block (200g)', 'Feta
-- cheese', 6.00, '200 grams') returned null, while the equivalent plain
-- '200'/'g' returns a real number.
--
-- Root cause: parse_unit_amount()'s only number extraction is a LEADING
-- digit match at the very start of the unit string (`^([\d.]+)`) --
-- "block (200g)" starts with "block", not a digit, so no number is ever
-- found, and none of the specific unit regexes match either ("200g" has
-- no word boundary between the digit and "g" for \yg\y to catch), so it
-- falls all the way to the 'each' catch-all with amount=1. This is a
-- different gap than 20260812020000's each_to_gram_bridge (that one
-- bridges a genuinely unit-less "each" quantity via a separate average-
-- weight table) -- here the actual weight is already spelled out right
-- in the text, it just isn't being read.
--
-- Fix: before the existing leading-number extraction, check for a
-- parenthetical "(<number><unit>)" hint anywhere in the unit text (e.g.
-- "block (200g)", "bag (1kg)", "bottle (500ml)") and use ITS number+unit
-- directly if present -- takes priority over the surrounding word
-- ("block") entirely, since the parenthetical is always the more
-- specific, authoritative figure when both are given. Falls through to
-- the existing logic unchanged when no parenthetical hint exists.

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

  -- Parenthetical weight/volume hint, e.g. "block (200g)" -> 200, 'g'.
  -- Checked before anything else -- when present it's always the real,
  -- specific figure, regardless of what word it's attached to.
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
  elsif t ~ 'litre|liter|\yl\y' then
    result.amount := num * 1000; result.base_unit := 'ml';
  elsif t ~ 'millilitre|milliliter|\yml\y' then
    result.amount := num; result.base_unit := 'ml';
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
  else
    result.amount := num; result.base_unit := 'each';
  end if;

  return result;
end;
$$;

comment on function public.parse_unit_amount(text, text) is
  'Parses a recipe/reference quantity+unit pair into a normalized {amount, base_unit} (g/ml/each). Checks for a parenthetical weight/volume hint first ("block (200g)" -> 200g, taking priority over the surrounding word) before falling back to the standard leading-number + unit-keyword parse used for plain units ("200 g", "500 mL", "3 cloves", ...). Unrecognized units with no parenthetical hint fall to base_unit=''each'', amount=the parsed leading number (or 1).';

-- Re-materialize every recipe -- expected to change price/nutrition only
-- for ingredients using a parenthetical weight hint that previously
-- fell through to a bare, unscalable 'each' (this migration's own
-- trigger case: Feta cheese, Firm tofu). Every other unit format is
-- untouched.
select public.refresh_recipe_deal_tags();
select public.refresh_recipe_nutrition();
