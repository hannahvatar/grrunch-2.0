-- "100 gr" (used by a few human-verified staple entries -- Chili
-- flakes, Garlic powder, Onion powder) wasn't recognized as grams at
-- all: the gram regex only matched the word "gram(s)" or a standalone
-- "g", and "gr" satisfies neither ("g" alone requires a word boundary
-- right after it, which "gr" doesn't have). It silently fell through to
-- the default case -- amount=100, base_unit='each' -- so every recipe
-- ingredient trying to scale against one of these three references
-- treated a 100-GRAM reference as "each" and never scaled correctly.

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
  else
    result.amount := num; result.base_unit := 'each';
  end if;

  return result;
end;
$$;

select public.refresh_recipe_deal_tags();
