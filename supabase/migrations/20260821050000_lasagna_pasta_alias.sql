-- Building a lasagna recipe from this week's real deals: "lasagna
-- noodles" was never added to the pasta-shape alias list (spaghetti,
-- penne, fettuccine, etc. all already map to the generic "pasta"
-- staple, but lasagna was simply missed), so it couldn't reach the real,
-- reviewed "Pasta" reference at all -- would have silently contributed
-- $0/0 calories.
create or replace function public.staple_alias_words(words text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(
    case w
      when 'spaghetti' then 'pasta'
      when 'spaghettini' then 'pasta'
      when 'macaroni' then 'pasta'
      when 'rigatoni' then 'pasta'
      when 'penne' then 'pasta'
      when 'fusilli' then 'pasta'
      when 'rotini' then 'pasta'
      when 'linguine' then 'pasta'
      when 'fettuccine' then 'pasta'
      when 'farfalle' then 'pasta'
      when 'orzo' then 'pasta'
      when 'ziti' then 'pasta'
      when 'vermicelli' then 'pasta'
      when 'lasagna' then 'pasta'
      else w
    end
  ), '{}')
  from unnest(words) as w;
$$;
