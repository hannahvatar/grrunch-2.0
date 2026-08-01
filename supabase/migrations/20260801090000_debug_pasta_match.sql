create or replace function public.debug_staple_match(ing_name text, ing_qty text, ing_unit text)
returns jsonb
language plpgsql
as $$
declare
  ing_words text[];
  alias_ing_words text[];
  staple record;
  staple_words text[];
  best_staple_price numeric;
  best_staple_unit text;
  best_staple_score int;
  score int;
  scaled numeric;
begin
  ing_words := public.normalize_words(ing_name);
  alias_ing_words := public.staple_alias_words(ing_words);
  best_staple_price := null;
  best_staple_unit := null;
  best_staple_score := -1;

  for staple in
    select ingredient_name, avg_price, unit from public.statcan_reference_prices
  loop
    staple_words := public.staple_alias_words(public.normalize_words(staple.ingredient_name));
    if array_length(staple_words, 1) > 0
       and not (array_length(staple_words, 1) = 1 and staple.ingredient_name ~* '\y(fresh|frozen)\y')
    then
      score := public.reference_match_score(staple_words, alias_ing_words);
      if score is not null and score > best_staple_score then
        best_staple_price := staple.avg_price;
        best_staple_unit := staple.unit;
        best_staple_score := score;
      end if;
    end if;
  end loop;

  if best_staple_price is not null then
    scaled := public.scale_reference_price(ing_qty, ing_unit, ing_name, best_staple_price, best_staple_unit);
  end if;

  return jsonb_build_object(
    'ing_words', ing_words,
    'alias_ing_words', alias_ing_words,
    'best_staple_price', best_staple_price,
    'best_staple_unit', best_staple_unit,
    'best_staple_score', best_staple_score,
    'scaled', scaled
  );
end;
$$;
