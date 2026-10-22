-- Anabelle (2026-10-22): companion recipes are versatile standalone
-- recipes, never tied to an ingredient. The last two companions still
-- attached by ingredient-name match (recipe_id NULL) get pinned directly
-- to the one recipe they were showing on, like the other 26.
--
--   Pizza Sauce (No-Cook, Whole Tomato)       -> Pizza Party Pasta
--   Basic Sauerkraut (Salt-Fermented Cabbage) -> Kielbasa Gone Krauty
--
-- Matched by recipe name, not a hard-coded id, so this stays correct on
-- a fresh database too.
update public.sub_recipes sr
set recipe_id = r.id
from public.recipes r
where sr.recipe_id is null
  and sr.title = 'Pizza Sauce (No-Cook, Whole Tomato)'
  and r.name = 'Pizza Party Pasta';

update public.sub_recipes sr
set recipe_id = r.id
from public.recipes r
where sr.recipe_id is null
  and sr.title = 'Basic Sauerkraut (Salt-Fermented Cabbage)'
  and r.name = 'Kielbasa Gone Krauty';
