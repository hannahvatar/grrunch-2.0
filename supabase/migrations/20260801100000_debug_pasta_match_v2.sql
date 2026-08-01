create or replace function public.debug_staple_match_v2(ing_name text)
returns jsonb
language plpgsql
as $$
declare
  ing_words text[];
  alias_ing_words text[];
  staple record;
  staple_words text[];
  score int;
  rows jsonb := '[]'::jsonb;
begin
  ing_words := public.normalize_words(ing_name);
  alias_ing_words := public.staple_alias_words(ing_words);

  for staple in
    select ingredient_name, avg_price, unit from public.statcan_reference_prices
    where ingredient_name ilike '%pasta%'
  loop
    staple_words := public.staple_alias_words(public.normalize_words(staple.ingredient_name));
    score := public.reference_match_score(staple_words, alias_ing_words);
    rows := rows || jsonb_build_object(
      'ingredient_name', staple.ingredient_name,
      'staple_words', staple_words,
      'score', score
    );
  end loop;

  return jsonb_build_object('alias_ing_words', alias_ing_words, 'rows', rows);
end;
$$;
