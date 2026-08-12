-- Found while adding "Instant Pork Ramen Soup": "2 stalks" green onion
-- and "1 bunch" (the reference denomination) both collapsed to a bare
-- 'each' amount with no distinction between the two, same class of bug
-- as the clove/bulb one fixed in 20260801150000 -- "2 stalks" would
-- price as 2 WHOLE bunches (a bunch typically holds ~8 stalks), an ~8x
-- overcharge. ~8 stalks/bunch is a standard estimate, same "rough but
-- documented, better than silently wrong" policy as the clove estimate.

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
  elsif t ~ 'stalk' then
    result.amount := num / 8; result.base_unit := 'each';
  else
    result.amount := num; result.base_unit := 'each';
  end if;

  return result;
end;
$$;

comment on function public.parse_unit_amount(text, text) is
  'Parses a recipe/reference quantity+unit pair into a normalized {amount, base_unit} (g/ml/each). Checks for a parenthetical weight/volume hint first ("block (200g)" -> 200g), then plain unit keywords -- including clove (1/10 bulb) and stalk (1/8 bunch) as sub-units of their reference''s own whole-unit denomination. Unrecognized units with no parenthetical hint fall to base_unit=''each'', amount=the parsed leading number (or 1).';

select public.refresh_recipe_deal_tags();
select public.refresh_recipe_nutrition();
