-- Fixes a long-standing bug: a recipe using a PARTIAL amount of a staple
-- (e.g. "1 tbsp olive oil", "2 cups rice") was priced at the reference's
-- FULL package/rate price, not scaled to how much the recipe actually
-- uses. $0.90/100ml olive oil credited a full $0.90 to a recipe using
-- just 15ml (1 tbsp) of it -- 6x too much.
--
-- Also stops trusting staple_reference_prices rows where
-- checked_by = 'ai_estimated' -- per-user decision, no more AI-guessed
-- prices in the trusted chain, only StatCan or human-verified entries.
-- Existing ai_estimated rows are left in place (not deleted) as a visible
-- "still needs a real price" checklist, they're just no longer matched
-- against.

create type public.unit_amount as (amount numeric, base_unit text);

-- Parses a quantity+unit into a normalized (amount, base_unit) pair,
-- base_unit always one of 'ml' (volume), 'g' (weight), or 'each' (count).
-- Handles both recipe-style units (tsp/tbsp/cup/g/ml/each) and
-- reference-style units (StatCan's "500 grams", "per kilogram", "unit",
-- "1 dozen", or a human's own "per lb"/"454 g" entry) -- same vocabulary
-- covers both, recipes just additionally use cooking measures.
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
  -- Recipe quantities aren't always plain decimals -- "1/2", "3/4", even
  -- "to taste". A raw ::numeric cast would throw on any of those, so
  -- each form is checked explicitly; anything unparseable (e.g. "to
  -- taste") leaves qty null, which propagates to a null result.amount --
  -- the caller (scale_reference_price) treats that as "can't scale this
  -- one" rather than crashing or guessing a quantity.
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

  -- "per kilogram" etc. is a rate: the given price is for exactly 1 of
  -- that unit, regardless of quantity/unit_text's own leading number.
  if t like 'per %' then
    t := substring(t from 5);
    num := 1;
  else
    num := (regexp_match(t, '^([\d.]+)'))[1]::numeric;
    num := coalesce(num, 1) * qty; -- null qty makes num null, propagates through
  end if;

  if t ~ 'kilogram|\ykg\y' then
    result.amount := num * 1000; result.base_unit := 'g';
  elsif t ~ 'gram|\yg\y' then
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

-- Approximate grams-per-cup for common dry/semi-solid staples -- lets a
-- recipe stating volume (cups/tbsp) convert to weight when the reference
-- price is denominated by weight (or vice versa). Deliberately small and
-- approximate; expand as new staples come up rather than guessing.
create table public.staple_densities (
  id uuid primary key default gen_random_uuid(),
  ingredient_name text not null unique,
  grams_per_cup numeric(10, 2) not null check (grams_per_cup > 0)
);

alter table public.staple_densities enable row level security;

create policy "staple_densities are publicly readable" on public.staple_densities
  for select using (true);

insert into public.staple_densities (ingredient_name, grams_per_cup) values
  ('Flour', 120),
  ('Sugar', 200),
  ('Brown sugar', 220),
  ('Powdered sugar', 120),
  ('Rice', 185),
  ('Oats', 90),
  ('Cornmeal', 120),
  ('Breadcrumbs', 108),
  ('Honey', 340),
  ('Peanut butter', 258),
  ('Butter', 227),
  ('Cocoa powder', 84),
  ('Salt', 273),
  ('Baking soda', 220),
  ('Baking powder', 192);

-- Scales a reference price to the recipe's actual quantity. Returns null
-- (rather than a guessed number) when the two sides are incompatible
-- units (e.g. recipe in ml, reference in g) and no density entry bridges
-- them -- an unscaled full reference price would be more misleading than
-- no price at all.
create or replace function public.scale_reference_price(
  recipe_quantity text,
  recipe_unit text,
  ingredient_name text,
  ref_price numeric,
  ref_unit text
)
returns numeric
language plpgsql
as $$
declare
  recipe_ua public.unit_amount;
  ref_ua public.unit_amount;
  density numeric;
  ing_words text[];
  density_words text[];
begin
  recipe_ua := public.parse_unit_amount(recipe_quantity, recipe_unit);
  -- ref_unit already carries its own amount ("500 grams", "per kilogram")
  -- -- quantity=1 makes parse_unit_amount's qty-multiplier a no-op.
  ref_ua := public.parse_unit_amount('1', ref_unit);

  if recipe_ua.base_unit = ref_ua.base_unit then
    return round(ref_price * (recipe_ua.amount / ref_ua.amount), 4);
  end if;

  -- Bridge a ml<->g mismatch using this ingredient's density, if known.
  ing_words := public.normalize_words(ingredient_name);
  for density, density_words in
    select d.grams_per_cup, public.normalize_words(d.ingredient_name)
    from public.staple_densities d
  loop
    if array_length(density_words, 1) > 0 and density_words <@ ing_words then
      if recipe_ua.base_unit = 'ml' and ref_ua.base_unit = 'g' then
        return round(ref_price * ((recipe_ua.amount / 236.588 * density) / ref_ua.amount), 4);
      elsif recipe_ua.base_unit = 'g' and ref_ua.base_unit = 'ml' then
        return round(ref_price * ((recipe_ua.amount / density * 236.588) / ref_ua.amount), 4);
      end if;
    end if;
  end loop;

  return null; -- incompatible units, no density bridge available
end;
$$;
