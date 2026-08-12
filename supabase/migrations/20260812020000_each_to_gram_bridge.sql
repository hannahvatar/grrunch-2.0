-- scale_reference_price() bridges ml<->g (via staple_densities, cups) but
-- had no bridge at all for 'each'-based recipe quantities (e.g. "2 whole
-- Eggs") against a gram-denominated reference -- and refresh_recipe_
-- nutrition() ALWAYS calls it with a hardcoded '100 g' ref_unit for
-- generic ingredients, so any count-based recipe ingredient (whole eggs,
-- egg yolks, and likely others going forward) could never earn nutrition
-- credit no matter how good its staple_reference_prices coverage was --
-- same silent-zero failure class as the "sliced" unit bug found earlier
-- this session, but structural rather than a one-line data fix. Found
-- while adding Kraft Dinner alla Carbonara (2 whole Eggs + 2 whole Egg
-- yolks) -- worth fixing generally since eggs alone will recur constantly
-- across the 200-recipe buildout.
--
-- New small reference table, same shape/policy as staple_densities:
-- average grams for one whole unit of a countable ingredient.
create table public.staple_avg_weights (
  id uuid primary key default gen_random_uuid(),
  ingredient_name text not null unique,
  grams_each numeric(10, 2) not null check (grams_each > 0)
);

alter table public.staple_avg_weights enable row level security;

create policy "staple_avg_weights is publicly readable" on public.staple_avg_weights
  for select using (true);

comment on table public.staple_avg_weights is
  'Average weight (grams) of one whole/each unit of a countable staple ingredient (e.g. one large egg ~= 50g) -- bridges an "each"-based recipe quantity to a gram-denominated reference price/nutrition figure, the each<->g counterpart to staple_densities'' ml<->g cup bridge.';

insert into public.staple_avg_weights (ingredient_name, grams_each) values
  ('Eggs', 50),
  ('Egg yolks', 17);

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
  cooked_ratio numeric;
  ing_words text[];
  density_words text[];
  dry_equivalent_cups numeric;
  avg_weight numeric;
  avg_weight_words text[];
begin
  recipe_ua := public.parse_unit_amount(recipe_quantity, recipe_unit);
  ref_ua := public.parse_unit_amount('1', ref_unit);

  if recipe_ua.base_unit = ref_ua.base_unit then
    return round(ref_price * (recipe_ua.amount / ref_ua.amount), 4);
  end if;

  ing_words := public.normalize_words(ingredient_name);

  -- 'each' recipe quantity ("2 whole Eggs") against a gram-denominated
  -- reference (a price whose unit is itself in grams, or nutrition's
  -- fixed '100 g' basis) -- tried before the cup-density bridge below
  -- since it's a more direct, less lossy conversion when it applies.
  for avg_weight, avg_weight_words in
    select w.grams_each, public.normalize_words(w.ingredient_name)
    from public.staple_avg_weights w
  loop
    if array_length(avg_weight_words, 1) > 0 and avg_weight_words <@ ing_words then
      if recipe_ua.base_unit = 'each' and ref_ua.base_unit = 'g' then
        return round(ref_price * ((recipe_ua.amount * avg_weight) / ref_ua.amount), 4);
      end if;
    end if;
  end loop;

  cooked_ratio := 1;
  select c.cooked_per_dry_ratio into cooked_ratio
  from public.staple_cooked_yield c
  where public.normalize_words(c.ingredient_name) <@ ing_words
  limit 1;
  cooked_ratio := coalesce(cooked_ratio, 1);

  for density, density_words in
    select d.grams_per_cup, public.normalize_words(d.ingredient_name)
    from public.staple_densities d
  loop
    if array_length(density_words, 1) > 0 and density_words <@ ing_words then
      if recipe_ua.base_unit = 'ml' and ref_ua.base_unit = 'g' then
        dry_equivalent_cups := (recipe_ua.amount / 236.588) / cooked_ratio;
        return round(ref_price * ((dry_equivalent_cups * density) / ref_ua.amount), 4);
      elsif recipe_ua.base_unit = 'g' and ref_ua.base_unit = 'ml' then
        return round(ref_price * (((recipe_ua.amount / density * cooked_ratio) * 236.588) / ref_ua.amount), 4);
      end if;
    end if;
  end loop;

  return null;
end;
$$;

-- No-op check: re-materialize every recipe now that Eggs/Egg yolks can
-- reach nutrition credit for the first time -- expected to change only
-- recipes actually using whole-count eggs (none live yet; Kraft Dinner
-- alla Carbonara is added in a separate step after this migration).
select public.refresh_recipe_deal_tags();
select public.refresh_recipe_nutrition();
