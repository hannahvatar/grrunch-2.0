-- Plurals beyond a plain "s" in recipe tag / deal keyword matching
-- (Anabelle, 2026-10-07): "tomato" and "tomatoes", "berry" and
-- "berries", "peach" and "peaches" now count as the same word.
--   berries -> berry      tomatoes -> tomato     peaches -> peach
--   boxes -> box          glasses -> glass       apples -> apple
-- A word ending in "ss" (swiss, glass) keeps its last s.
-- match_norm is only used by recipe-tag matching (20261006030000);
-- nothing stores its output, so the next refresh picks this up.
create or replace function public.match_singular(word text)
returns text
language sql
immutable
as $$
  select case
    when length(word) > 4 and word ~ 'ies$' then left(word, length(word) - 3) || 'y'
    when length(word) > 4 and word ~ '(oes|ches|shes|xes|sses|zes)$' then left(word, length(word) - 2)
    when length(word) > 3 and word ~ '[^s]s$' then left(word, length(word) - 1)
    else word
  end;
$$;

create or replace function public.match_norm(txt text)
returns text
language sql
immutable
as $$
  select coalesce(string_agg(public.match_singular(w), ' ' order by ord), '')
  from regexp_split_to_table(lower(coalesce(txt, '')), '[^a-z0-9]+') with ordinality as t(w, ord)
  where w <> '';
$$;
