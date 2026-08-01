-- Fixes two compounding problems found while checking the Kabobs
-- recipe's "2 cups Rice" price:
--
-- 1. A generic recipe ingredient ("Rice") could never match a
--    variety-specific reference name ("White rice", "Brown rice") --
--    matching required the reference's words to be a subset of the
--    ingredient's words, which only works when the *ingredient* is the
--    more specific side (e.g. "Tilda basmati rice" -> "Rice"). StatCan
--    happens to split rice into "White rice"/"Brown rice" SKUs, so a
--    plain "Rice" ingredient matched neither and fell through to the
--    untrustworthy ai_estimated flat guess. Fixed by also trying the
--    reverse direction (ingredient words subset of reference words), but
--    only when every extra reference word is a known variety descriptor
--    (white/brown/basmati/...) -- never an arbitrary word, so "Rice"
--    still correctly does NOT match "Rice noodles" ("noodles" isn't a
--    descriptor).
--
-- 2. Even once matched, "2 cups Rice" was priced as 2 cups of *dry* rice
--    (185 g/cup) against a dry-rice reference -- but a recipe stating
--    "cups of rice" as a dish component means cooked rice, and rice
--    roughly triples in volume when cooked. Confirmed with the actual
--    numbers: 2 cups cooked rice ~= 2/3 cup dry rice (~125 g) against
--    StatCan's "White rice, 2 kg, $8.91" reference is ~$0.55, not the
--    ~$1.65 the uncorrected dry-cup math produced (3x too high). Fixed
--    via a small cooked:dry volume-ratio table, applied before the
--    existing density (grams-per-cup) bridge.

create or replace function public.variety_descriptors()
returns text[]
language sql
immutable
as $$
  select array['white','brown','long','grain','basmati','jasmine','parboiled','instant','wild','short'];
$$;

-- Score a candidate reference match against an ingredient's normalized
-- words. Returns null when there's no valid match. Strict matches
-- (reference is fully contained in the ingredient, e.g. "Rice" inside
-- "Tilda basmati rice") always outscore variety-descriptor fallback
-- matches (ingredient is fully contained in the reference, e.g. "Rice"
-- inside "White rice"), and within each mode, the more specific/closer
-- match wins. "white" is weighted cheaper than other descriptors (the
-- unmarked default variety -- a recipe/ingredient that just says "Rice"
-- conventionally means white rice), so "White rice" deterministically
-- beats "Brown rice" on a tie instead of depending on query row order.
create or replace function public.reference_match_score(staple_words text[], ing_words text[])
returns int
language plpgsql
immutable
as $$
declare
  w text;
  extra_count int := 0;
  cost int := 0;
begin
  if array_length(staple_words, 1) is null then
    return null;
  end if;

  if staple_words <@ ing_words then
    return 1000 + array_length(staple_words, 1);
  end if;

  if not (ing_words <@ staple_words) then
    return null;
  end if;

  foreach w in array staple_words loop
    if not (w = any(ing_words)) then
      if not (w = any(public.variety_descriptors())) then
        return null;
      end if;
      extra_count := extra_count + 1;
      cost := cost + (case when w = 'white' then 1 else 2 end);
    end if;
  end loop;

  if extra_count = 0 then
    return null; -- identical word sets would've matched strict above
  end if;

  return 100 - cost;
end;
$$;

-- Approximate cooked:dry volume ratio for staples recipes state in
-- cooked-serving terms (e.g. "2 cups rice" in a dish description means
-- cooked rice, not dry rice measured in a cup). Deliberately small;
-- only add an entry once actually confirmed, same policy as
-- staple_densities.
create table public.staple_cooked_yield (
  id uuid primary key default gen_random_uuid(),
  ingredient_name text not null unique,
  cooked_per_dry_ratio numeric(10, 2) not null check (cooked_per_dry_ratio > 0)
);

alter table public.staple_cooked_yield enable row level security;

create policy "staple_cooked_yield is publicly readable" on public.staple_cooked_yield
  for select using (true);

insert into public.staple_cooked_yield (ingredient_name, cooked_per_dry_ratio) values
  ('Rice', 3);

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
begin
  recipe_ua := public.parse_unit_amount(recipe_quantity, recipe_unit);
  ref_ua := public.parse_unit_amount('1', ref_unit);

  if recipe_ua.base_unit = ref_ua.base_unit then
    return round(ref_price * (recipe_ua.amount / ref_ua.amount), 4);
  end if;

  ing_words := public.normalize_words(ingredient_name);

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

create or replace function public.refresh_recipe_deal_tags()
returns void
language plpgsql
security definer
as $$
declare
  rec record;
  ing jsonb;
  deal record;
  staple record;
  new_tags jsonb;
  ing_words text[];
  deal_words text[];
  staple_words text[];
  matched boolean;
  total numeric;
  best_staple_price numeric;
  best_staple_unit text;
  best_staple_score int;
  score int;
  scaled numeric;
begin
  for rec in select id, ingredients, servings from public.recipes loop
    new_tags := '[]'::jsonb;
    total := 0;

    for ing in select value from jsonb_array_elements(rec.ingredients) loop
      ing_words := public.normalize_words(ing->>'name');
      matched := false;

      for deal in
        select item_name, chain_name, image_url, price, original_price
        from public.curated_deals
        where status = 'approved'
      loop
        deal_words := public.normalize_words(deal.item_name);

        if array_length(deal_words, 1) > 0 and deal_words <@ ing_words then
          new_tags := new_tags || jsonb_build_object(
            'name', ing->>'name',
            'store', deal.chain_name,
            'image_url', deal.image_url,
            'price', deal.price,
            'original_price', deal.original_price,
            'discount_pct', round((1 - deal.price / deal.original_price) * 100),
            'quantity_estimated', false
          );
          total := total + deal.price;
          matched := true;
          exit;
        end if;
      end loop;

      if not matched then
        best_staple_price := null;
        best_staple_unit := null;
        best_staple_score := -1;

        for staple in
          select ingredient_name, avg_price, unit from public.statcan_reference_prices
        loop
          staple_words := public.normalize_words(staple.ingredient_name);
          if array_length(staple_words, 1) > 0
             and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\y(fresh|frozen)\y')
          then
            score := public.reference_match_score(staple_words, ing_words);
            if score is not null and score > best_staple_score then
              best_staple_price := staple.avg_price;
              best_staple_unit := staple.unit;
              best_staple_score := score;
            end if;
          end if;
        end loop;

        if best_staple_price is null then
          for staple in
            select ingredient_name, avg_price, unit from public.produce_reference_prices
          loop
            staple_words := public.normalize_words(staple.ingredient_name);
            if array_length(staple_words, 1) > 0
               and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\y(fresh|frozen)\y')
            then
              score := public.reference_match_score(staple_words, ing_words);
              if score is not null and score > best_staple_score then
                best_staple_price := staple.avg_price;
                best_staple_unit := staple.unit;
                best_staple_score := score;
              end if;
            end if;
          end loop;
        end if;

        if best_staple_price is null then
          for staple in
            select ingredient_name, avg_price, unit
            from public.staple_reference_prices
            where checked_by <> 'ai_estimated'
          loop
            staple_words := public.normalize_words(staple.ingredient_name);
            if array_length(staple_words, 1) > 0
               and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\y(fresh|frozen)\y')
            then
              score := public.reference_match_score(staple_words, ing_words);
              if score is not null and score > best_staple_score then
                best_staple_price := staple.avg_price;
                best_staple_unit := staple.unit;
                best_staple_score := score;
              end if;
            end if;
          end loop;
        end if;

        if best_staple_price is not null then
          scaled := public.scale_reference_price(
            ing->>'quantity', ing->>'unit', ing->>'name',
            best_staple_price, best_staple_unit
          );
          if scaled is not null then
            total := total + scaled;
          end if;
        end if;
      end if;
    end loop;

    update public.recipes
      set deal_tags = new_tags,
          price = case when rec.servings > 0 then round(total / rec.servings, 2) else total end
      where id = rec.id;
  end loop;
end;
$$;

select public.refresh_recipe_deal_tags();
