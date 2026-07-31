-- Automates what was previously a manual, judgment-based weekly task: matching
-- each recipe's ingredients against the current week's curated_deals to build
-- deal_tags. Manual matching doesn't scale (can't eyeball 24+ recipes against
-- 150+ deals every week) and silently goes stale if someone forgets to run it.
--
-- Matching rule is deliberately strict and mechanical, not fuzzy: a deal only
-- tags an ingredient if every significant word in the deal's item_name also
-- appears in the ingredient's name (e.g. deal "Maple Leaf hot dogs Original"
-- matches ingredient "Maple Leaf hot dogs or Schneiders Original wieners",
-- but deal "SWEET CORN" does NOT match ingredient "Sweet Peppers" -- "corn"
-- isn't present). No brand-substitution guessing (e.g. treating one chain's
-- "fully cooked entrees" as equivalent to another's "pork back ribs" just
-- because they share a brand name) -- if nothing matches, the ingredient
-- just doesn't get a tag. A recipe with zero tags stops surfacing in Meals
-- (existing app-level rule) rather than showing a stale or guessed deal.

create or replace function public.normalize_words(txt text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(word), '{}')
  from (
    select regexp_split_to_table(
      lower(regexp_replace(txt, '[^a-zA-Z0-9]+', ' ', 'g')),
      '\s+'
    ) as word
  ) w
  where length(word) > 3
    and word not in ('with', 'from', 'each', 'selected', 'variety', 'varieties', 'fresh', 'frozen');
$$;

create or replace function public.refresh_recipe_deal_tags()
returns void
language plpgsql
as $$
declare
  rec record;
  ing jsonb;
  deal record;
  new_tags jsonb;
  ing_words text[];
  deal_words text[];
begin
  for rec in select id, ingredients from public.recipes loop
    new_tags := '[]'::jsonb;

    for ing in select value from jsonb_array_elements(rec.ingredients) loop
      ing_words := public.normalize_words(ing->>'name');

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
            'discount_pct', round((1 - deal.price / deal.original_price) * 100),
            'quantity_estimated', false
          );
          exit; -- first match wins, one tag per ingredient
        end if;
      end loop;
    end loop;

    update public.recipes set deal_tags = new_tags where id = rec.id;
  end loop;
end;
$$;

comment on function public.refresh_recipe_deal_tags() is
  'Rebuilds deal_tags for every recipe from scratch against the current curated_deals table. Deterministic word-subset matching only -- no brand-substitution guessing. Call after every curated_deals sync (see scripts/sync-deals). A recipe whose ingredients no longer match anything ends up with deal_tags = [] and stops surfacing in Meals -- this is expected weekly churn, not a bug.';
