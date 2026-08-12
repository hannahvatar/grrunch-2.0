-- Found while adding "Instant Pork Ramen Soup" (unrelated recipe, but
-- adding two new staple_reference_prices rows perturbed table scan
-- order enough to flip an existing tie): normalize_words()'s blanket
-- "length(word) > 3" filter silently drops meaningful 3-letter food
-- words -- "oil" and "soy" specifically -- collapsing genuinely
-- different products down to the same bare remaining word:
--   - "Sesame oil" -> {sesame} (oil dropped) -- an ordinary tbsp/tsp
--     match against "Sesame seeds" ({sesame, seeds}), a completely
--     different product, since {sesame} <@ {sesame, seeds}.
--   - "Soy sauce" -> {sauce} (soy dropped), same collapse as
--     "Hot sauce" -> {sauce} (hot dropped) -- both become a 1-word
--     "sauce" signature, so which one wins is whatever order the table
--     scan happens to return on a tie, not which one is actually
--     correct for the ingredient.
--
-- Confirmed real, not hypothetical: "Honey Garlic Chicken with Broccoli
-- and Rice"'s price silently moved 3.90 -> 4.11 purely from adding two
-- unrelated new reference rows elsewhere in the table -- its own
-- ingredients (Soy sauce, Sesame seeds) never changed at all.
--
-- Fix: keep 'soy' and 'oil' even though they're <=3 characters --
-- deliberately narrow (an allowlist of the two specific words already
-- proven to cause a real wrong match), not a blanket length-threshold
-- change, which would be a much larger, harder-to-audit blast radius
-- across every existing match in the app.

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
  where (length(word) > 3 or word in ('soy', 'oil'))
    and word not in ('with', 'from', 'each', 'selected', 'variety', 'varieties', 'fresh', 'frozen');
$$;

select public.refresh_recipe_deal_tags();
select public.refresh_recipe_nutrition();
