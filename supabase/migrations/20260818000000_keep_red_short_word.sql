-- Real bug, caught live building the Watermelon, Blueberry & Spinach
-- Salad: "red" (3 letters) was dropped by normalize_words()'s blanket
-- length filter everywhere it's used -- pricing (matched a generic
-- StatCan "Onions" reference at $5.47/kg instead of the ingredient's
-- own "Red onion" staple row at $2.00/kg), and the client-side
-- whole-unit display bridge (STAPLE_UNIT_WEIGHTS_G's 'red onions' key
-- collapsed to the exact same {onions} word set as the plain 'onions'
-- key, so "Red onions" could never be told apart from "Onions" no
-- matter how the lookup was ordered -- confirmed showing "½ onion"
-- for a genuinely whole 110 g red onion, silently reading it against
-- the generic 150 g onion size instead).
--
-- Same fix pattern as 20260812110000 (soy/oil): add 'red' to the
-- narrow KEEP_SHORT_WORDS allowlist rather than changing the blanket
-- length threshold -- 'red' is a real, meaningful qualifier
-- (distinguishes red onion from onion, red cabbage from cabbage, red
-- bell pepper from bell pepper), same reasoning as soy/oil being real
-- product-distinguishing words too short to survive length>3.
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
  where (length(word) > 3 or word in ('soy', 'oil', 'red'))
    and word not in ('with', 'from', 'each', 'selected', 'variety', 'varieties', 'fresh', 'frozen');
$$;

select public.refresh_recipe_deal_tags();
select public.refresh_recipe_nutrition();
