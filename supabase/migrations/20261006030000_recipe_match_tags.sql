-- Recipe match tags (Anabelle, 2026-10-06). Each recipe ingredient can
-- carry `match_tags` (and rarely `fallback_tags`) inside recipes.ingredients.
-- They're for deal matching only and are never shown to users.
--
-- Rule for a tagged ingredient:
--   - A deal matches when one of the deal's keywords is the same as one of
--     the ingredient's tags (case- and plural-insensitive). A deal with no
--     keywords is compared by its own name instead. No partial matching:
--     `pasta` never matches a deal keyworded "pasta sauce".
--   - Several matches: cheapest wins, with the existing home-store
--     tie-break (prefer_deal). Tag order means nothing.
--   - fallback_tags are only tried when no main tag matches anything
--     (turkey bacon -> bacon; sour cream -> plain yogurt).
-- Untagged ingredients keep the previous word/keyword matching unchanged.
-- The approved tags are also in docs/recipe-match-tags.json.

-- "Ground Beef" / "ground beefs" -> 'ground beef'. Keeps every word
-- (unlike normalize_words, which drops short words like "ham" and "mix").
create or replace function public.match_norm(txt text)
returns text
language sql
immutable
as $$
  select coalesce(string_agg(public.singularize(w), ' ' order by ord), '')
  from regexp_split_to_table(lower(coalesce(txt, '')), '[^a-z0-9]+') with ordinality as t(w, ord)
  where w <> '';
$$;

-- A recipe ingredient's tags (jsonb array of strings) as normalized text[].
create or replace function public.tag_keys(tags jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(public.match_norm(t)) filter (where public.match_norm(t) <> ''), '{}')
  from jsonb_array_elements_text(case when jsonb_typeof(tags) = 'array' then tags else '[]'::jsonb end) t;
$$;

-- What a deal answers to: its keywords, or its own name if it has none.
create or replace function public.deal_match_keys(item_name text, keyword_matches text[])
returns text[]
language sql
immutable
as $$
  select case
    when exists (select 1 from unnest(coalesce(keyword_matches, '{}')) k where public.match_norm(k) <> '')
      then (select array_agg(public.match_norm(k)) from unnest(keyword_matches) k where public.match_norm(k) <> '')
    else array[public.match_norm(item_name)]
  end;
$$;

-- Store the approved tags on each recipe ingredient (matched by recipe
-- name + ingredient name). The updated_at trigger is paused so this data
-- backfill doesn't stamp every recipe as just edited (dev-recipes sorts by
-- updated_at; see 20260821030000).
alter table public.recipes disable trigger recipes_set_updated_at;

with v(recipe, ingredient, match_tags, fallback_tags) as (values
  ('Basic, But Make It Lasagna', 'Ground beef', '["ground beef", "lean ground beef", "medium ground beef", "extra lean ground beef", "regular ground beef"]'::jsonb, null::jsonb),
  ('Basic, But Make It Lasagna', 'Oven-ready lasagna noodles', '["lasagna noodles"]'::jsonb, null::jsonb),
  ('Basic, But Make It Lasagna', 'NO NAME® Pasta Sauce, Tomato Sauce or Tomato Paste', '["pasta sauce", "tomato sauce"]'::jsonb, null::jsonb),
  ('Basic, But Make It Lasagna', 'Ricotta cheese', '["ricotta"]'::jsonb, null::jsonb),
  ('Basic, But Make It Lasagna', 'Mozzarella cheese', '["mozzarella"]'::jsonb, null::jsonb),
  ('Basic, But Make It Lasagna', 'Onion', '["yellow onions", "onions"]'::jsonb, null::jsonb),
  ('Basic, But Make It Lasagna', 'Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('Basic, But Make It Lasagna', 'Cooking oil', '["vegetable oil", "canola oil"]'::jsonb, null::jsonb),
  ('Basic, But Make It Lasagna', 'Italian seasoning', '["italian seasoning"]'::jsonb, null::jsonb),
  ('Basic, But Make It Lasagna', 'Black pepper', '["black pepper"]'::jsonb, null::jsonb),
  ('Basic, But Make It Lasagna', 'Salt', '["salt"]'::jsonb, null::jsonb),
  ('BBQ Ribs ’n’ Cauli Nuggets', 'Swiss Chalet fully cooked pork back ribs', '["cooked ribs", "pork back ribs"]'::jsonb, null::jsonb),
  ('BBQ Ribs ’n’ Cauli Nuggets', 'CAULIFLOWER', '["cauliflower"]'::jsonb, null::jsonb),
  ('BBQ Ribs ’n’ Cauli Nuggets', 'Flour', '["flour"]'::jsonb, null::jsonb),
  ('BBQ Ribs ’n’ Cauli Nuggets', 'Breadcrumbs', '["breadcrumbs"]'::jsonb, null::jsonb),
  ('BBQ Ribs ’n’ Cauli Nuggets', 'Garlic powder', '["garlic powder"]'::jsonb, null::jsonb),
  ('BBQ Ribs ’n’ Cauli Nuggets', 'Smoked paprika', '["smoked paprika", "paprika"]'::jsonb, null::jsonb),
  ('BBQ Ribs ’n’ Cauli Nuggets', 'Sea salt', '["salt"]'::jsonb, null::jsonb),
  ('BBQ Ribs ’n’ Cauli Nuggets', 'Ground black pepper', '["black pepper"]'::jsonb, null::jsonb),
  ('BBQ Ribs ’n’ Cauli Nuggets', 'Eggs', '["eggs"]'::jsonb, null::jsonb),
  ('BBQ Ribs ’n’ Cauli Nuggets', 'Vegetable oil', '["vegetable oil", "canola oil"]'::jsonb, null::jsonb),
  ('Berry Good Watermelon Salad', 'Seedless watermelon', '["watermelon"]'::jsonb, null::jsonb),
  ('Berry Good Watermelon Salad', 'Blueberries', '["blueberries"]'::jsonb, null::jsonb),
  ('Berry Good Watermelon Salad', 'Bunched Spinach', '["spinach"]'::jsonb, null::jsonb),
  ('Berry Good Watermelon Salad', 'Feta cheese', '["feta"]'::jsonb, null::jsonb),
  ('Berry Good Watermelon Salad', 'Red onions', '["red onions"]'::jsonb, null::jsonb),
  ('Berry Good Watermelon Salad', 'Mint', '["mint"]'::jsonb, null::jsonb),
  ('Berry Good Watermelon Salad', 'Pistachios', '["pistachios"]'::jsonb, null::jsonb),
  ('Berry Good Watermelon Salad', 'PC Splendido Sliced Meats', '["sliced deli meat", "prosciutto"]'::jsonb, null::jsonb),
  ('Berry Good Watermelon Salad', 'Olive oil', '["olive oil"]'::jsonb, null::jsonb),
  ('Berry Good Watermelon Salad', 'Lime juice', '["lime juice", "limes"]'::jsonb, null::jsonb),
  ('Berry Good Watermelon Salad', 'Honey', '["honey"]'::jsonb, null::jsonb),
  ('Berry Good Watermelon Salad', 'Dijon mustard', '["dijon mustard"]'::jsonb, null::jsonb),
  ('Berry Good Watermelon Salad', 'Salt and pepper', '["salt", "black pepper"]'::jsonb, null::jsonb),
  ('Boursin-Me-Up Chicken & Mushroom Rice', 'Prime raised without antibiotics boneless skinless chicken breasts', '["chicken breasts", "boneless skinless chicken breasts"]'::jsonb, null::jsonb),
  ('Boursin-Me-Up Chicken & Mushroom Rice', 'PC® WHOLE CREMINI or WHITE MUSHROOMS, 454 G', '["whole cremini", "cremini mushrooms", "white mushrooms", "mushrooms"]'::jsonb, null::jsonb),
  ('Boursin-Me-Up Chicken & Mushroom Rice', 'Boursin cheese', '["boursin cheese", "boursin"]'::jsonb, null::jsonb),
  ('Boursin-Me-Up Chicken & Mushroom Rice', 'Rice', '["rice"]'::jsonb, null::jsonb),
  ('Boursin-Me-Up Chicken & Mushroom Rice', 'Onions', '["yellow onions", "onions"]'::jsonb, null::jsonb),
  ('Boursin-Me-Up Chicken & Mushroom Rice', 'Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('Boursin-Me-Up Chicken & Mushroom Rice', 'Olive oil', '["olive oil"]'::jsonb, null::jsonb),
  ('Boursin-Me-Up Chicken & Mushroom Rice', 'Salt and pepper', '["salt", "black pepper"]'::jsonb, null::jsonb),
  ('Breakfast for Dinner — Eggy Croissant', 'Croissants', '["croissants"]'::jsonb, null::jsonb),
  ('Breakfast for Dinner — Eggy Croissant', 'COMPLIMENTS Large Omega-3 Eggs', '["eggs"]'::jsonb, null::jsonb),
  ('Breakfast for Dinner — Eggy Croissant', 'Cheddar cheese', '["cheddar"]'::jsonb, null::jsonb),
  ('Breakfast for Dinner — Eggy Croissant', 'Salted or Unsalted Butter', '["butter"]'::jsonb, null::jsonb),
  ('Breakfast for Dinner — Eggy Croissant', 'Salt and pepper', '["salt", "black pepper"]'::jsonb, null::jsonb),
  ('Breakfast for Dinner — Froot Loops French Toasts', 'White bread', '["white bread", "bread"]'::jsonb, null::jsonb),
  ('Breakfast for Dinner — Froot Loops French Toasts', 'Eggs', '["eggs"]'::jsonb, null::jsonb),
  ('Breakfast for Dinner — Froot Loops French Toasts', 'Milk', '["milk"]'::jsonb, null::jsonb),
  ('Breakfast for Dinner — Froot Loops French Toasts', 'Froot Loops cereal', '["froot loops", "cereal"]'::jsonb, null::jsonb),
  ('Breakfast for Dinner — Froot Loops French Toasts', 'Vanilla extract', '["vanilla extract"]'::jsonb, null::jsonb),
  ('Breakfast for Dinner — Froot Loops French Toasts', 'Ground cinnamon', '["cinnamon"]'::jsonb, null::jsonb),
  ('Breakfast for Dinner — Froot Loops French Toasts', 'Butter', '["butter"]'::jsonb, null::jsonb),
  ('Breakfast for Dinner — Froot Loops French Toasts', '0% Greek yogurt', '["greek yogurt", "yogurt"]'::jsonb, null::jsonb),
  ('Catch of the Tray', 'Dressed Tilapia', '["tilapia"]'::jsonb, null::jsonb),
  ('Catch of the Tray', 'Potatoes', '["potatoes"]'::jsonb, null::jsonb),
  ('Catch of the Tray', 'Carrots', '["carrots"]'::jsonb, null::jsonb),
  ('Catch of the Tray', 'Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('Catch of the Tray', 'Lemon', '["lemons"]'::jsonb, null::jsonb),
  ('Catch of the Tray', 'Olive oil', '["olive oil"]'::jsonb, null::jsonb),
  ('Catch of the Tray', 'Paprika', '["paprika"]'::jsonb, null::jsonb),
  ('Catch of the Tray', 'Salt', '["salt"]'::jsonb, null::jsonb),
  ('Cauli Mac & Cheese, Please', 'Italpasta elbow pasta', '["macaroni", "pasta"]'::jsonb, null::jsonb),
  ('Cauli Mac & Cheese, Please', 'Cauliflower', '["cauliflower"]'::jsonb, null::jsonb),
  ('Cauli Mac & Cheese, Please', 'Bacon', '["bacon"]'::jsonb, null::jsonb),
  ('Cauli Mac & Cheese, Please', 'Evaporated milk', '["evaporated milk"]'::jsonb, null::jsonb),
  ('Cauli Mac & Cheese, Please', 'Cheese slices', '["cheese slices"]'::jsonb, null::jsonb),
  ('Cauli Mac & Cheese, Please', 'Butter', '["butter"]'::jsonb, null::jsonb),
  ('Cauli Mac & Cheese, Please', 'Dijon mustard', '["dijon mustard"]'::jsonb, null::jsonb),
  ('Cauli Mac & Cheese, Please', 'Salt', '["salt"]'::jsonb, null::jsonb),
  ('Cheesy Whizzy Spaghetti', 'Spaghetti', '["spaghetti", "pasta"]'::jsonb, null::jsonb),
  ('Cheesy Whizzy Spaghetti', 'Cheez Whiz', '["cheez whiz"]'::jsonb, null::jsonb),
  ('Cheesy Whizzy Spaghetti', 'Milk', '["milk"]'::jsonb, null::jsonb),
  ('Cheesy Whizzy Spaghetti', 'Unsalted Butter', '["butter"]'::jsonb, null::jsonb),
  ('Cheesy Whizzy Spaghetti', 'Black pepper', '["black pepper"]'::jsonb, null::jsonb),
  ('Cheesy Whizzy Spaghetti', 'Salt', '["salt"]'::jsonb, null::jsonb),
  ('Chicken, Beans & Corny Things', 'Prime raised without antibiotics boneless skinless chicken breasts', '["chicken breasts", "boneless skinless chicken breasts"]'::jsonb, null::jsonb),
  ('Chicken, Beans & Corny Things', 'Heinz beans', '["baked beans"]'::jsonb, null::jsonb),
  ('Chicken, Beans & Corny Things', 'Sweet Corn', '["corn", "sweet corn", "canned corn", "frozen corn"]'::jsonb, null::jsonb),
  ('Chicken, Beans & Corny Things', 'Kale', '["kale"]'::jsonb, null::jsonb),
  ('Chicken, Beans & Corny Things', 'Rice', '["rice"]'::jsonb, null::jsonb),
  ('Chicken, Beans & Corny Things', 'Vegetable oil', '["vegetable oil", "canola oil"]'::jsonb, null::jsonb),
  ('Chicken, Beans & Corny Things', 'Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('Chicken, Beans & Corny Things', 'Smoked paprika', '["smoked paprika", "paprika"]'::jsonb, null::jsonb),
  ('Chicken, Beans & Corny Things', 'Chili powder', '["chili powder"]'::jsonb, null::jsonb),
  ('Chicken, Beans & Corny Things', 'Ground cumin', '["cumin"]'::jsonb, null::jsonb),
  ('Chicken, Beans & Corny Things', 'Butter', '["butter"]'::jsonb, null::jsonb),
  ('Chicken, Beans & Corny Things', 'Salt and pepper', '["salt", "black pepper"]'::jsonb, null::jsonb),
  ('Coconut About Basa & Eggplant', 'Basa Steaks', '["basa steaks", "basa"]'::jsonb, null::jsonb),
  ('Coconut About Basa & Eggplant', 'Coconut milk', '["coconut milk"]'::jsonb, null::jsonb),
  ('Coconut About Basa & Eggplant', 'Eggplant', '["eggplant"]'::jsonb, null::jsonb),
  ('Coconut About Basa & Eggplant', 'Yellow onions', '["yellow onions", "onions"]'::jsonb, null::jsonb),
  ('Coconut About Basa & Eggplant', 'Red curry paste', '["red curry paste", "curry paste"]'::jsonb, null::jsonb),
  ('Coconut About Basa & Eggplant', 'Fish sauce', '["fish sauce"]'::jsonb, null::jsonb),
  ('Coconut About Basa & Eggplant', 'Brown sugar', '["brown sugar"]'::jsonb, null::jsonb),
  ('Coconut About Basa & Eggplant', 'Canola oil', '["canola oil", "vegetable oil"]'::jsonb, null::jsonb),
  ('Coconut About Basa & Eggplant', 'Basmati rice', '["basmati rice", "rice"]'::jsonb, null::jsonb),
  ('Coconut About Basa & Eggplant', 'Cilantro', '["cilantro"]'::jsonb, null::jsonb),
  ('Coconut About Basa & Eggplant', 'Limes', '["limes"]'::jsonb, null::jsonb),
  ('Cold Cuts, Hot Pizza', 'Western Family Pizza Crust Mix', '["pizza crust mix", "pizza crust"]'::jsonb, null::jsonb),
  ('Cold Cuts, Hot Pizza', 'Dijon mustard', '["dijon mustard"]'::jsonb, null::jsonb),
  ('Cold Cuts, Hot Pizza', 'Western Family Pizza Sauce', '["pizza sauce"]'::jsonb, null::jsonb),
  ('Cold Cuts, Hot Pizza', 'Monsieur Gustav Gouda or Cheddar', '["gouda", "cheddar"]'::jsonb, null::jsonb),
  ('Cold Cuts, Hot Pizza', 'Maple Leaf Natural Selections Sliced Meats', '["sliced deli meat", "smoked ham"]'::jsonb, null::jsonb),
  ('Cold Cuts, Hot Pizza', 'Onion', '["yellow onions", "onions"]'::jsonb, null::jsonb),
  ('Cold Cuts, Hot Pizza', 'Salt and pepper', '["salt", "black pepper"]'::jsonb, null::jsonb),
  ('Cottage Pie, Meet Rutabaga', 'Ground beef', '["ground beef", "lean ground beef", "medium ground beef", "extra lean ground beef", "regular ground beef"]'::jsonb, null::jsonb),
  ('Cottage Pie, Meet Rutabaga', 'Yellow onions', '["yellow onions", "onions"]'::jsonb, null::jsonb),
  ('Cottage Pie, Meet Rutabaga', 'Carrots', '["carrots"]'::jsonb, null::jsonb),
  ('Cottage Pie, Meet Rutabaga', 'Celery', '["celery"]'::jsonb, null::jsonb),
  ('Cottage Pie, Meet Rutabaga', 'Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('Cottage Pie, Meet Rutabaga', 'Tomato paste', '["tomato paste"]'::jsonb, null::jsonb),
  ('Cottage Pie, Meet Rutabaga', 'All-purpose flour', '["flour", "all-purpose flour"]'::jsonb, null::jsonb),
  ('Cottage Pie, Meet Rutabaga', 'Beef broth', '["beef broth", "broth"]'::jsonb, null::jsonb),
  ('Cottage Pie, Meet Rutabaga', 'Worcestershire sauce', '["worcestershire sauce"]'::jsonb, null::jsonb),
  ('Cottage Pie, Meet Rutabaga', 'Potatoes', '["potatoes"]'::jsonb, null::jsonb),
  ('Cottage Pie, Meet Rutabaga', 'Rutabaga', '["rutabaga"]'::jsonb, null::jsonb),
  ('Cottage Pie, Meet Rutabaga', 'Butter', '["butter"]'::jsonb, null::jsonb),
  ('Cottage Pie, Meet Rutabaga', 'Milk', '["milk"]'::jsonb, null::jsonb),
  ('Cottage Pie, Meet Rutabaga', 'Salt', '["salt"]'::jsonb, null::jsonb),
  ('Crack a Tin — Sardine Spaghetti', 'Grace sardines in tomato sauce', '["sardines in tomato sauce", "sardines"]'::jsonb, null::jsonb),
  ('Crack a Tin — Sardine Spaghetti', 'Spaghetti', '["spaghetti", "pasta"]'::jsonb, null::jsonb),
  ('Crack a Tin — Sardine Spaghetti', 'Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('Crack a Tin — Sardine Spaghetti', 'Chili flakes', '["chili flakes"]'::jsonb, null::jsonb),
  ('Crack a Tin — Sardine Spaghetti', 'Bunched Spinach', '["spinach"]'::jsonb, null::jsonb),
  ('Crack a Tin — Sardine Spaghetti', 'Parsley', '["parsley"]'::jsonb, null::jsonb),
  ('Crack a Tin — Sardine Spaghetti', 'Olive oil', '["olive oil"]'::jsonb, null::jsonb),
  ('Curry Up Coconut Chicken', 'Split Chicken Breast', '["split chicken breasts", "chicken breasts"]'::jsonb, null::jsonb),
  ('Curry Up Coconut Chicken', 'Aroy-D Coconut Milk', '["coconut milk"]'::jsonb, null::jsonb),
  ('Curry Up Coconut Chicken', 'Onion', '["yellow onions", "onions"]'::jsonb, null::jsonb),
  ('Curry Up Coconut Chicken', 'Rooster Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('Curry Up Coconut Chicken', 'Fresh ginger', '["ginger"]'::jsonb, null::jsonb),
  ('Curry Up Coconut Chicken', 'Curry powder', '["curry powder"]'::jsonb, null::jsonb),
  ('Curry Up Coconut Chicken', 'Cooking oil', '["vegetable oil", "canola oil"]'::jsonb, null::jsonb),
  ('Curry Up Coconut Chicken', 'Lime', '["limes"]'::jsonb, null::jsonb),
  ('Curry Up Coconut Chicken', 'Cilantro', '["cilantro"]'::jsonb, null::jsonb),
  ('Curry Up Coconut Chicken', 'Salt and pepper', '["salt", "black pepper"]'::jsonb, null::jsonb),
  ('Curry Up, It''s Vegan!', 'Rooster Tofu', '["firm tofu"]'::jsonb, null::jsonb),
  ('Curry Up, It''s Vegan!', 'Rooster Coconut Milk', '["coconut milk"]'::jsonb, null::jsonb),
  ('Curry Up, It''s Vegan!', 'Coloured Peppers', '["sweet peppers", "bell peppers", "coloured peppers"]'::jsonb, null::jsonb),
  ('Curry Up, It''s Vegan!', 'Cilantro', '["cilantro"]'::jsonb, null::jsonb),
  ('Curry Up, It''s Vegan!', 'Chickpeas', '["canned chickpeas", "chickpeas"]'::jsonb, null::jsonb),
  ('Curry Up, It''s Vegan!', 'Onion', '["yellow onions", "onions"]'::jsonb, null::jsonb),
  ('Curry Up, It''s Vegan!', 'Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('Curry Up, It''s Vegan!', 'Fresh ginger', '["ginger"]'::jsonb, null::jsonb),
  ('Curry Up, It''s Vegan!', 'Curry powder', '["curry powder"]'::jsonb, null::jsonb),
  ('Curry Up, It''s Vegan!', 'Ground cumin', '["cumin"]'::jsonb, null::jsonb),
  ('Curry Up, It''s Vegan!', 'Turmeric', '["turmeric"]'::jsonb, null::jsonb),
  ('Curry Up, It''s Vegan!', 'Cooking oil', '["vegetable oil", "canola oil"]'::jsonb, null::jsonb),
  ('Curry Up, It''s Vegan!', 'Rice', '["rice"]'::jsonb, null::jsonb),
  ('Curry Up, It''s Vegan!', 'Lime', '["limes"]'::jsonb, null::jsonb),
  ('Curry Up, It''s Vegan!', 'Salt', '["salt"]'::jsonb, null::jsonb),
  ('Eggplant Got Beef', 'Chinese Eggplant', '["eggplant"]'::jsonb, null::jsonb),
  ('Eggplant Got Beef', 'Ground beef', '["ground beef", "lean ground beef", "medium ground beef", "extra lean ground beef", "regular ground beef"]'::jsonb, null::jsonb),
  ('Eggplant Got Beef', 'Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('Eggplant Got Beef', 'Ginger', '["ginger"]'::jsonb, null::jsonb),
  ('Eggplant Got Beef', 'Green onions', '["green onions"]'::jsonb, null::jsonb),
  ('Eggplant Got Beef', 'Soy sauce', '["soy sauce"]'::jsonb, null::jsonb),
  ('Eggplant Got Beef', 'Sesame oil', '["sesame oil"]'::jsonb, null::jsonb),
  ('Eggplant Got Beef', 'Cornstarch', '["cornstarch"]'::jsonb, null::jsonb),
  ('Eggplant Got Beef', 'Brown sugar', '["brown sugar"]'::jsonb, null::jsonb),
  ('Eggplant Got Beef', 'Rice', '["rice"]'::jsonb, null::jsonb),
  ('Eggplant Got Beef', 'Vegetable oil', '["vegetable oil", "canola oil"]'::jsonb, null::jsonb),
  ('Eggplant Got Beef', 'Salt and pepper', '["salt", "black pepper"]'::jsonb, null::jsonb),
  ('Fast Food Fakeout — Big Mac Combo', 'Compliments Burgers & More beef patties', '["beef patties", "burgers", "ground beef", "lean ground beef", "medium ground beef", "extra lean ground beef", "regular ground beef"]'::jsonb, null::jsonb),
  ('Fast Food Fakeout — Big Mac Combo', 'McCain Superfries or Specialty Fries or Pockets', '["frozen fries", "fries"]'::jsonb, null::jsonb),
  ('Fast Food Fakeout — Big Mac Combo', 'Hamburger buns', '["hamburger buns"]'::jsonb, null::jsonb),
  ('Fast Food Fakeout — Big Mac Combo', 'Kraft Singles', '["cheese slices"]'::jsonb, null::jsonb),
  ('Fast Food Fakeout — Big Mac Combo', 'Lettuce', '["lettuce"]'::jsonb, null::jsonb),
  ('Fast Food Fakeout — Big Mac Combo', 'Onion', '["yellow onions", "onions"]'::jsonb, null::jsonb),
  ('Fast Food Fakeout — Big Mac Combo', 'Pickles', '["pickles"]'::jsonb, null::jsonb),
  ('Fast Food Fakeout — Big Mac Combo', 'Mayonnaise', '["mayonnaise"]'::jsonb, null::jsonb),
  ('Fast Food Fakeout — Big Mac Combo', 'Ketchup', '["ketchup"]'::jsonb, null::jsonb),
  ('Fast Food Fakeout — Big Mac Combo', 'Relish', '["relish"]'::jsonb, null::jsonb),
  ('Fast Food Fakeout — Big Mac Combo', 'White vinegar', '["white vinegar"]'::jsonb, null::jsonb),
  ('Fast Food Fakeout — Big Mac Combo', 'Vegetable oil', '["vegetable oil", "canola oil"]'::jsonb, null::jsonb),
  ('Fast Food Fakeout — Big Mac Combo', 'Salt and pepper', '["salt", "black pepper"]'::jsonb, null::jsonb),
  ('Fish Sticks & Chill', 'High Liner Family Fish', '["fish sticks", "breaded fish"]'::jsonb, null::jsonb),
  ('Fish Sticks & Chill', 'Cavendish Farms Classic Fries', '["frozen fries", "fries"]'::jsonb, null::jsonb),
  ('Fish Sticks & Chill', 'Salt and pepper', '["salt", "black pepper"]'::jsonb, null::jsonb),
  ('Fish Sticks & Chill', 'Lemon', '["lemons"]'::jsonb, null::jsonb),
  ('Fry Me a Sandwich', 'McCain Superfries or Specialty Fries or Pockets', '["frozen fries", "fries"]'::jsonb, null::jsonb),
  ('Fry Me a Sandwich', 'your favourite sandwich bread', '["sliced bread", "bread"]'::jsonb, null::jsonb),
  ('Fry Me a Sandwich', 'shredded cheddar', '["shredded cheese", "cheddar"]'::jsonb, null::jsonb),
  ('Fry Me a Sandwich', 'Plain Greek yogurt (2%)', '["greek yogurt", "yogurt"]'::jsonb, null::jsonb),
  ('Fry Me a Sandwich', 'Ketchup', '["ketchup"]'::jsonb, null::jsonb),
  ('Fry Me a Sandwich', 'Dijon mustard', '["dijon mustard"]'::jsonb, null::jsonb),
  ('Fry Me a Sandwich', 'Relish', '["relish"]'::jsonb, null::jsonb),
  ('Fry Me a Sandwich', 'Smoked paprika', '["smoked paprika", "paprika"]'::jsonb, null::jsonb),
  ('Fry Me a Sandwich', 'Garlic powder', '["garlic powder"]'::jsonb, null::jsonb),
  ('Fry Me a Sandwich', 'shredded green cabbage or lettuce', '["green cabbage", "coleslaw mix", "lettuce"]'::jsonb, null::jsonb),
  ('Fry Me a Sandwich', 'White vinegar', '["white vinegar"]'::jsonb, null::jsonb),
  ('Fry Me a Sandwich', 'Salt and black pepper', '["salt", "black pepper"]'::jsonb, null::jsonb),
  ('Honey Garlic Chicken Noodle Toss', 'Prime raised without antibiotics boneless skinless chicken breasts', '["chicken breasts", "boneless skinless chicken breasts"]'::jsonb, null::jsonb),
  ('Honey Garlic Chicken Noodle Toss', 'Olive oil', '["olive oil"]'::jsonb, null::jsonb),
  ('Honey Garlic Chicken Noodle Toss', 'Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('Honey Garlic Chicken Noodle Toss', 'Honey', '["honey"]'::jsonb, null::jsonb),
  ('Honey Garlic Chicken Noodle Toss', 'Soy sauce', '["soy sauce"]'::jsonb, null::jsonb),
  ('Honey Garlic Chicken Noodle Toss', 'Broccoli Crown', '["broccoli"]'::jsonb, null::jsonb),
  ('Honey Garlic Chicken Noodle Toss', 'Rice noodles', '["rice noodles"]'::jsonb, null::jsonb),
  ('Honey Garlic Chicken Noodle Toss', 'Green onions', '["green onions"]'::jsonb, null::jsonb),
  ('Honey Garlic Chicken Noodle Toss', 'Salt and pepper', '["salt", "black pepper"]'::jsonb, null::jsonb),
  ('Honey, I Glazed the Chicken', 'Compliments Fresh Air-Chilled Drumsticks', '["chicken drumsticks"]'::jsonb, null::jsonb),
  ('Honey, I Glazed the Chicken', 'Honey', '["honey"]'::jsonb, null::jsonb),
  ('Honey, I Glazed the Chicken', 'Soy sauce', '["soy sauce"]'::jsonb, null::jsonb),
  ('Honey, I Glazed the Chicken', 'Ketchup', '["ketchup"]'::jsonb, null::jsonb),
  ('Honey, I Glazed the Chicken', 'Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('Honey, I Glazed the Chicken', 'Cooking oil', '["vegetable oil", "canola oil"]'::jsonb, null::jsonb),
  ('Honey, I Glazed the Chicken', 'Smoked paprika', '["smoked paprika", "paprika"]'::jsonb, null::jsonb),
  ('Honey, I Glazed the Chicken', 'Black pepper', '["black pepper"]'::jsonb, null::jsonb),
  ('Honey, I Glazed the Chicken', 'Salt', '["salt"]'::jsonb, null::jsonb),
  ('Honey, I Glazed the Chicken', 'Green onions', '["green onions"]'::jsonb, null::jsonb),
  ('Honey, I Glazed the Chicken', 'Broccoli Crown', '["broccoli"]'::jsonb, null::jsonb),
  ('Honey, I Glazed the Chicken', 'Olive oil', '["olive oil"]'::jsonb, null::jsonb),
  ('Honey, I Glazed the Chicken', 'Lemon', '["lemons"]'::jsonb, null::jsonb),
  ('Hot Dog Hash', 'Schneiders Original Recipe wieners', '["wieners", "hot dogs", "sausages"]'::jsonb, null::jsonb),
  ('Hot Dog Hash', 'Potatoes (preferably Yukon Gold)', '["yukon gold potatoes", "potatoes"]'::jsonb, null::jsonb),
  ('Hot Dog Hash', 'Onions', '["yellow onions", "onions"]'::jsonb, null::jsonb),
  ('Hot Dog Hash', 'Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('Hot Dog Hash', 'Olive oil', '["olive oil"]'::jsonb, null::jsonb),
  ('Hot Dog Hash', 'Salt and pepper', '["salt", "black pepper"]'::jsonb, null::jsonb),
  ('Hot Dog Hash', 'Green onions', '["green onions"]'::jsonb, null::jsonb),
  ('Instant Noodles Forever — The Pork One', 'Instant ramen noodles (85g each, with seasoning packet)', '["instant noodles", "ramen"]'::jsonb, null::jsonb),
  ('Instant Noodles Forever — The Pork One', 'Pork belly', '["pork belly"]'::jsonb, null::jsonb),
  ('Instant Noodles Forever — The Pork One', 'Water', '[]'::jsonb, null::jsonb),
  ('Instant Noodles Forever — The Pork One', 'Eggs', '["eggs"]'::jsonb, null::jsonb),
  ('Instant Noodles Forever — The Pork One', 'Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('Instant Noodles Forever — The Pork One', 'Fresh ginger', '["ginger"]'::jsonb, null::jsonb),
  ('Instant Noodles Forever — The Pork One', 'Green onions', '["green onions"]'::jsonb, null::jsonb),
  ('Instant Noodles Forever — The Pork One', 'Soy sauce', '["soy sauce"]'::jsonb, null::jsonb),
  ('Instant Noodles Forever — The Pork One', 'Sesame oil', '["sesame oil"]'::jsonb, null::jsonb),
  ('Instant Noodles Forever — The Pork One', 'Chili flakes', '["chili flakes"]'::jsonb, null::jsonb),
  ('Jamaican Patty with Mango Salsa & Caramelized Plantain', 'Patty King Jamaican beef patties', '["jamaican patties"]'::jsonb, null::jsonb),
  ('Jamaican Patty with Mango Salsa & Caramelized Plantain', 'Plantains', '["plantains"]'::jsonb, null::jsonb),
  ('Jamaican Patty with Mango Salsa & Caramelized Plantain', 'Mango', '["mangoes"]'::jsonb, null::jsonb),
  ('Jamaican Patty with Mango Salsa & Caramelized Plantain', 'Black beans', '["black beans", "canned black beans"]'::jsonb, null::jsonb),
  ('Jamaican Patty with Mango Salsa & Caramelized Plantain', 'Lime', '["limes"]'::jsonb, null::jsonb),
  ('Jamaican Patty with Mango Salsa & Caramelized Plantain', 'Red onion', '["red onions"]'::jsonb, null::jsonb),
  ('Jamaican Patty with Mango Salsa & Caramelized Plantain', 'Cilantro', '["cilantro"]'::jsonb, null::jsonb),
  ('Jamaican Patty with Mango Salsa & Caramelized Plantain', 'Vegetable oil', '["vegetable oil", "canola oil"]'::jsonb, null::jsonb),
  ('Jamaican Patty with Mango Salsa & Caramelized Plantain', 'Chili flakes or cayenne', '["chili flakes", "cayenne"]'::jsonb, null::jsonb),
  ('Jamaican Patty with Mango Salsa & Caramelized Plantain', 'Salt', '["salt"]'::jsonb, null::jsonb),
  ('K-Pogo (TikTok Korean Corn Dog)', 'Pogo Original 20-pack', '["corn dogs", "pogo"]'::jsonb, null::jsonb),
  ('K-Pogo (TikTok Korean Corn Dog)', 'Eggs', '["eggs"]'::jsonb, null::jsonb),
  ('K-Pogo (TikTok Korean Corn Dog)', 'Panko breadcrumbs', '["panko", "breadcrumbs"]'::jsonb, null::jsonb),
  ('K-Pogo (TikTok Korean Corn Dog)', 'Vegetable oil for deep-frying', '["vegetable oil", "canola oil"]'::jsonb, null::jsonb),
  ('K-Pogo (TikTok Korean Corn Dog)', 'Nacho cheese sauce', '["nacho cheese sauce"]'::jsonb, null::jsonb),
  ('K-Pogo (TikTok Korean Corn Dog)', 'Lay''s Ketchup Chips', '["chips"]'::jsonb, null::jsonb),
  ('K-Pogo (TikTok Korean Corn Dog)', 'Ketchup', '["ketchup"]'::jsonb, null::jsonb),
  ('K-Pogo (TikTok Korean Corn Dog)', 'Mustard', '["mustard"]'::jsonb, null::jsonb),
  ('Kielbasa Gone Krauty', 'Polish smoked kielbasa', '["kielbasa"]'::jsonb, null::jsonb),
  ('Kielbasa Gone Krauty', 'Sauerkraut', '["sauerkraut"]'::jsonb, null::jsonb),
  ('Kielbasa Gone Krauty', 'Yellow onion', '["yellow onions", "onions"]'::jsonb, null::jsonb),
  ('Kielbasa Gone Krauty', 'Butter', '["butter"]'::jsonb, null::jsonb),
  ('Kielbasa Gone Krauty', 'Bay leaves', '["bay leaves"]'::jsonb, null::jsonb),
  ('Kielbasa Gone Krauty', 'Black pepper', '["black pepper"]'::jsonb, null::jsonb),
  ('Kielbasa Gone Krauty', 'Water', '[]'::jsonb, null::jsonb),
  ('Kraft Dinner alla Carbonara', 'Kraft Dinner', '["kraft dinner", "macaroni and cheese", "mac and cheese"]'::jsonb, null::jsonb),
  ('Kraft Dinner alla Carbonara', 'Turkey bacon', '["turkey bacon"]'::jsonb, '["bacon", "cooked bacon", "pre-cooked bacon"]'::jsonb),
  ('Kraft Dinner alla Carbonara', 'Egg yolks', '["eggs"]'::jsonb, null::jsonb),
  ('Kraft Dinner alla Carbonara', 'Grated parmesan', '["parmesan"]'::jsonb, null::jsonb),
  ('Kraft Dinner alla Carbonara', 'Milk', '["milk"]'::jsonb, null::jsonb),
  ('Kraft Dinner alla Carbonara', 'Black pepper', '["black pepper"]'::jsonb, null::jsonb),
  ('Kraft Dinner alla Carbonara', 'Frozen peas', '["frozen peas", "peas", "canned peas"]'::jsonb, null::jsonb),
  ('Kraft Singles Mac ’n’ Mingle', 'Pasta', '["pasta"]'::jsonb, null::jsonb),
  ('Kraft Singles Mac ’n’ Mingle', 'Kraft Singles', '["cheese slices"]'::jsonb, null::jsonb),
  ('Kraft Singles Mac ’n’ Mingle', 'Cheddar', '["cheddar"]'::jsonb, null::jsonb),
  ('Kraft Singles Mac ’n’ Mingle', 'Turkey bacon', '["turkey bacon"]'::jsonb, '["bacon", "cooked bacon", "pre-cooked bacon"]'::jsonb),
  ('Kraft Singles Mac ’n’ Mingle', 'Milk', '["milk"]'::jsonb, null::jsonb),
  ('Kraft Singles Mac ’n’ Mingle', 'Butter', '["butter"]'::jsonb, null::jsonb),
  ('Kraft Singles Mac ’n’ Mingle', 'Flour', '["flour"]'::jsonb, null::jsonb),
  ('Kraft Singles Mac ’n’ Mingle', 'Dijon mustard', '["dijon mustard"]'::jsonb, null::jsonb),
  ('Kraft Singles Mac ’n’ Mingle', 'Garlic powder', '["garlic powder"]'::jsonb, null::jsonb),
  ('Kraft Singles Mac ’n’ Mingle', 'Onion powder', '["onion powder"]'::jsonb, null::jsonb),
  ('Kraft Singles Mac ’n’ Mingle', 'Smoked paprika', '["smoked paprika", "paprika"]'::jsonb, null::jsonb),
  ('Kraft Singles Mac ’n’ Mingle', 'Black pepper', '["black pepper"]'::jsonb, null::jsonb),
  ('Kraft Singles Mac ’n’ Mingle', 'Panko breadcrumbs', '["panko", "breadcrumbs"]'::jsonb, null::jsonb),
  ('Kraft Singles Mac ’n’ Mingle', 'Grated parmesan', '["parmesan"]'::jsonb, null::jsonb),
  ('Lamb Sweet Tagine', 'Short Cut Lamb Leg', '["short cut lamb leg", "lamb leg"]'::jsonb, null::jsonb),
  ('Lamb Sweet Tagine', 'Yellow onions', '["yellow onions", "onions"]'::jsonb, null::jsonb),
  ('Lamb Sweet Tagine', 'Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('Lamb Sweet Tagine', 'Fresh ginger', '["ginger"]'::jsonb, null::jsonb),
  ('Lamb Sweet Tagine', 'Ground cumin', '["cumin"]'::jsonb, null::jsonb),
  ('Lamb Sweet Tagine', 'Paprika', '["paprika"]'::jsonb, null::jsonb),
  ('Lamb Sweet Tagine', 'Ground cinnamon', '["cinnamon"]'::jsonb, null::jsonb),
  ('Lamb Sweet Tagine', 'Canned diced tomatoes', '["canned tomatoes", "diced tomatoes"]'::jsonb, null::jsonb),
  ('Lamb Sweet Tagine', 'Water', '[]'::jsonb, null::jsonb),
  ('Lamb Sweet Tagine', 'Honey', '["honey"]'::jsonb, null::jsonb),
  ('Lamb Sweet Tagine', 'Bulk sweet potatoes', '["sweet potatoes"]'::jsonb, null::jsonb),
  ('Lamb Sweet Tagine', 'Carrots', '["carrots"]'::jsonb, null::jsonb),
  ('Lamb Sweet Tagine', 'Canned chickpeas', '["canned chickpeas", "chickpeas"]'::jsonb, null::jsonb),
  ('Lamb Sweet Tagine', 'Olive oil', '["olive oil"]'::jsonb, null::jsonb),
  ('Lamb Sweet Tagine', 'Salt', '["salt"]'::jsonb, null::jsonb),
  ('Napolitan (Japanese Ketchup Spaghetti) ナポリタン', 'Spaghetti', '["spaghetti", "pasta"]'::jsonb, null::jsonb),
  ('Napolitan (Japanese Ketchup Spaghetti) ナポリタン', 'Wiener sausages', '["wieners", "hot dogs", "sausages"]'::jsonb, null::jsonb),
  ('Napolitan (Japanese Ketchup Spaghetti) ナポリタン', 'Onions', '["yellow onions", "onions"]'::jsonb, null::jsonb),
  ('Napolitan (Japanese Ketchup Spaghetti) ナポリタン', 'Green bell peppers', '["green peppers", "bell peppers"]'::jsonb, null::jsonb),
  ('Napolitan (Japanese Ketchup Spaghetti) ナポリタン', 'Button mushrooms', '["white mushrooms", "mushrooms"]'::jsonb, null::jsonb),
  ('Napolitan (Japanese Ketchup Spaghetti) ナポリタン', 'Ketchup', '["ketchup"]'::jsonb, null::jsonb),
  ('Napolitan (Japanese Ketchup Spaghetti) ナポリタン', 'Butter', '["butter"]'::jsonb, null::jsonb),
  ('Napolitan (Japanese Ketchup Spaghetti) ナポリタン', 'Vegetable oil', '["vegetable oil", "canola oil"]'::jsonb, null::jsonb),
  ('Napolitan (Japanese Ketchup Spaghetti) ナポリタン', 'Sugar', '["sugar"]'::jsonb, null::jsonb),
  ('Napolitan (Japanese Ketchup Spaghetti) ナポリタン', 'Milk', '["milk"]'::jsonb, null::jsonb),
  ('Napolitan (Japanese Ketchup Spaghetti) ナポリタン', 'Salt', '["salt"]'::jsonb, null::jsonb),
  ('Napolitan (Japanese Ketchup Spaghetti) ナポリタン', 'Black pepper', '["black pepper"]'::jsonb, null::jsonb),
  ('Napolitan (Japanese Ketchup Spaghetti) ナポリタン', 'Grated parmesan', '["parmesan"]'::jsonb, null::jsonb),
  ('Pizza à la Caesar', 'Red Baron Classic or Thin Crust Frozen Pizza', '["frozen pizza", "pizza", "fresh pizza"]'::jsonb, null::jsonb),
  ('Pizza à la Caesar', 'Romaine Lettuce', '["romaine", "lettuce"]'::jsonb, null::jsonb),
  ('Pizza à la Caesar', 'Croutons', '["croutons"]'::jsonb, null::jsonb),
  ('Pizza à la Caesar', 'Grated Parmesan', '["parmesan"]'::jsonb, null::jsonb),
  ('Pizza à la Caesar', 'Caesar Dressing', '["caesar dressing"]'::jsonb, null::jsonb),
  ('Pizza à la Caesar', 'Bacon Bits', '["bacon bits", "bacon"]'::jsonb, null::jsonb),
  ('Pizza à la Caesar', 'Salt and pepper', '["salt", "black pepper"]'::jsonb, null::jsonb),
  ('Pizza Party Pasta', 'PC Splendido Sliced Meats Club Pack Roma Pepperoni', '["pepperoni"]'::jsonb, null::jsonb),
  ('Pizza Party Pasta', 'Pasta (rotini or penne)', '["rotini", "penne", "pasta"]'::jsonb, null::jsonb),
  ('Pizza Party Pasta', 'Pizza sauce (homemade)', '["pizza sauce"]'::jsonb, null::jsonb),
  ('Pizza Party Pasta', 'Mozzarella cheese', '["mozzarella"]'::jsonb, null::jsonb),
  ('Pizza Party Pasta', 'Onion', '["yellow onions", "onions"]'::jsonb, null::jsonb),
  ('Pizza Party Pasta', 'Sweet or Bell Peppers', '["sweet peppers", "bell peppers", "coloured peppers"]'::jsonb, null::jsonb),
  ('Pizza Party Pasta', 'PC Whole Cremini or White Mushrooms', '["whole cremini", "cremini mushrooms", "white mushrooms", "mushrooms"]'::jsonb, null::jsonb),
  ('Pizza Party Pasta', 'Vegetable oil', '["vegetable oil", "canola oil"]'::jsonb, null::jsonb),
  ('Pizza Party Pasta', 'Salt and pepper', '["salt", "black pepper"]'::jsonb, null::jsonb),
  ('Pork Yeah! Noodle Bowl', 'Ground Pork', '["ground pork", "lean ground pork", "medium ground pork", "extra lean ground pork", "regular ground pork"]'::jsonb, null::jsonb),
  ('Pork Yeah! Noodle Bowl', 'Green Cabbage', '["green cabbage", "cabbage"]'::jsonb, null::jsonb),
  ('Pork Yeah! Noodle Bowl', 'Rice noodles', '["rice noodles"]'::jsonb, null::jsonb),
  ('Pork Yeah! Noodle Bowl', 'Carrots', '["carrots"]'::jsonb, null::jsonb),
  ('Pork Yeah! Noodle Bowl', 'Yellow onions', '["yellow onions", "onions"]'::jsonb, null::jsonb),
  ('Pork Yeah! Noodle Bowl', 'Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('Pork Yeah! Noodle Bowl', 'Ginger', '["ginger"]'::jsonb, null::jsonb),
  ('Pork Yeah! Noodle Bowl', 'Soy sauce', '["soy sauce"]'::jsonb, null::jsonb),
  ('Pork Yeah! Noodle Bowl', 'Hoisin sauce', '["hoisin sauce"]'::jsonb, null::jsonb),
  ('Pork Yeah! Noodle Bowl', 'Canola oil', '["canola oil", "vegetable oil"]'::jsonb, null::jsonb),
  ('Pork Yeah! Noodle Bowl', 'Green onions', '["green onions"]'::jsonb, null::jsonb),
  ('Porktoberfest', 'Pork Half Loin', '["pork half loin", "pork loin"]'::jsonb, null::jsonb),
  ('Porktoberfest', 'Butternut Squash', '["butternut squash", "squash"]'::jsonb, null::jsonb),
  ('Porktoberfest', 'Royal Gala Apples', '["gala apples", "apples"]'::jsonb, null::jsonb),
  ('Porktoberfest', 'Yellow onions', '["yellow onions", "onions"]'::jsonb, null::jsonb),
  ('Porktoberfest', 'Olive oil', '["olive oil"]'::jsonb, null::jsonb),
  ('Porktoberfest', 'Maple syrup', '["maple syrup"]'::jsonb, null::jsonb),
  ('Porktoberfest', 'Dried rosemary', '["rosemary"]'::jsonb, null::jsonb),
  ('Porktoberfest', 'Salt', '["salt"]'::jsonb, null::jsonb),
  ('Potato, Bacon, Cheese, Repeat', 'Russet potatoes', '["russet potatoes", "potatoes"]'::jsonb, null::jsonb),
  ('Potato, Bacon, Cheese, Repeat', 'Canadian Butcher Bacon', '["bacon"]'::jsonb, null::jsonb),
  ('Potato, Bacon, Cheese, Repeat', 'Monsieur Gustav Cheddar', '["cheddar"]'::jsonb, null::jsonb),
  ('Potato, Bacon, Cheese, Repeat', 'Yellow onion', '["yellow onions", "onions"]'::jsonb, null::jsonb),
  ('Potato, Bacon, Cheese, Repeat', 'Compliments Sour Cream', '["sour cream"]'::jsonb, '["plain yogurt"]'::jsonb),
  ('Potato, Bacon, Cheese, Repeat', 'Chives', '["chives"]'::jsonb, null::jsonb),
  ('Potato, Bacon, Cheese, Repeat', 'Olive oil', '["olive oil"]'::jsonb, null::jsonb),
  ('Potato, Bacon, Cheese, Repeat', 'Salt', '["salt"]'::jsonb, null::jsonb),
  ('Potato, Bacon, Cheese, Repeat', 'Garlic powder', '["garlic powder"]'::jsonb, null::jsonb),
  ('Potato, Bacon, Cheese, Repeat', 'Black pepper', '["black pepper"]'::jsonb, null::jsonb),
  ('Salmon Says Fettuccine', 'Marinated Fresh Atlantic Salmon Fillets', '["salmon fillets", "salmon"]'::jsonb, null::jsonb),
  ('Salmon Says Fettuccine', 'Bunched Spinach', '["spinach"]'::jsonb, null::jsonb),
  ('Salmon Says Fettuccine', 'Fettuccine or linguine', '["fettuccine", "linguine", "pasta"]'::jsonb, null::jsonb),
  ('Salmon Says Fettuccine', 'Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('Salmon Says Fettuccine', 'Butter', '["butter"]'::jsonb, null::jsonb),
  ('Salmon Says Fettuccine', 'Cooking cream', '["cooking cream", "cream"]'::jsonb, null::jsonb),
  ('Salmon Says Fettuccine', 'Grated Parmesan', '["parmesan"]'::jsonb, null::jsonb),
  ('Salmon Says Fettuccine', 'Lemon', '["lemons"]'::jsonb, null::jsonb),
  ('Salmon Says Fettuccine', 'Black pepper', '["black pepper"]'::jsonb, null::jsonb),
  ('Salmon Says Fettuccine', 'Salt', '["salt"]'::jsonb, null::jsonb),
  ('Samosa Chaat', 'PRAN Frozen Samosas', '["samosas"]'::jsonb, null::jsonb),
  ('Samosa Chaat', 'Greek yogurt', '["greek yogurt", "yogurt"]'::jsonb, null::jsonb),
  ('Samosa Chaat', 'Cucumbers', '["cucumber"]'::jsonb, null::jsonb),
  ('Samosa Chaat', 'Beefsteak Tomatoes', '["beefsteak tomatoes", "tomatoes"]'::jsonb, null::jsonb),
  ('Samosa Chaat', 'Red onion', '["red onions"]'::jsonb, null::jsonb),
  ('Samosa Chaat', 'Tamarind chutney', '["tamarind chutney"]'::jsonb, null::jsonb),
  ('Samosa Chaat', 'Ground cumin', '["cumin"]'::jsonb, null::jsonb),
  ('Samosa Chaat', 'Chili powder', '["chili powder"]'::jsonb, null::jsonb),
  ('Samosa Chaat', 'Cilantro', '["cilantro"]'::jsonb, null::jsonb),
  ('Samosa Chaat', 'Lime', '["limes"]'::jsonb, null::jsonb),
  ('Samosa Chaat', 'Salt and pepper', '["salt", "black pepper"]'::jsonb, null::jsonb),
  ('Sizzling Pork Skewers', 'Marcangelo fresh pork kabobs', '["pork kabobs", "pork souvlaki"]'::jsonb, null::jsonb),
  ('Sizzling Pork Skewers', 'GREEN, GREY OR YELLOW ZUCCHINI', '["green zucchini", "zucchini"]'::jsonb, null::jsonb),
  ('Sizzling Pork Skewers', 'Rice', '["rice"]'::jsonb, null::jsonb),
  ('Sizzling Pork Skewers', 'Onions', '["yellow onions", "onions"]'::jsonb, null::jsonb),
  ('Sizzling Pork Skewers', 'Green onions', '["green onions"]'::jsonb, null::jsonb),
  ('Sizzling Pork Skewers', 'Olive oil', '["olive oil"]'::jsonb, null::jsonb),
  ('Sizzling Pork Skewers', 'Salt and pepper', '["salt", "black pepper"]'::jsonb, null::jsonb),
  ('Smoking Hot Sweet Potato & Kale Skillet', 'Great Value smoked sausages', '["smoked sausages", "sausages"]'::jsonb, null::jsonb),
  ('Smoking Hot Sweet Potato & Kale Skillet', 'KALE', '["kale"]'::jsonb, null::jsonb),
  ('Smoking Hot Sweet Potato & Kale Skillet', 'Sweet potatoes', '["sweet potatoes"]'::jsonb, null::jsonb),
  ('Smoking Hot Sweet Potato & Kale Skillet', 'Onions', '["yellow onions", "onions"]'::jsonb, null::jsonb),
  ('Smoking Hot Sweet Potato & Kale Skillet', 'Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('Smoking Hot Sweet Potato & Kale Skillet', 'Olive oil', '["olive oil"]'::jsonb, null::jsonb),
  ('Smoking Hot Sweet Potato & Kale Skillet', 'Salt and pepper', '["salt", "black pepper"]'::jsonb, null::jsonb),
  ('Souvlaki Street Bowl with a Kick', 'Marcangelo Chicken Breast Souvlaki kabobs', '["chicken souvlaki", "chicken kabobs"]'::jsonb, null::jsonb),
  ('Souvlaki Street Bowl with a Kick', 'Rice', '["rice"]'::jsonb, null::jsonb),
  ('Souvlaki Street Bowl with a Kick', 'NO NAME® NATURALLY IMPERFECT™ SWEET PEPPERS, 2.5 LB', '["sweet peppers", "bell peppers", "coloured peppers"]'::jsonb, null::jsonb),
  ('Souvlaki Street Bowl with a Kick', 'Onions', '["yellow onions", "onions"]'::jsonb, null::jsonb),
  ('Souvlaki Street Bowl with a Kick', 'Feta cheese', '["feta"]'::jsonb, null::jsonb),
  ('Souvlaki Street Bowl with a Kick', 'Lemon', '["lemons"]'::jsonb, null::jsonb),
  ('Souvlaki Street Bowl with a Kick', 'Salt and pepper', '["salt", "black pepper"]'::jsonb, null::jsonb),
  ('Squash the Hunger Chili', 'Ground Beef', '["ground beef", "lean ground beef", "medium ground beef", "extra lean ground beef", "regular ground beef"]'::jsonb, null::jsonb),
  ('Squash the Hunger Chili', 'Red Kidney Beans', '["red kidney beans", "kidney beans", "canned kidney beans", "canned red kidney beans"]'::jsonb, null::jsonb),
  ('Squash the Hunger Chili', 'Buttercup Squash', '["buttercup squash", "squash"]'::jsonb, null::jsonb),
  ('Squash the Hunger Chili', 'Yellow onions', '["yellow onions", "onions"]'::jsonb, null::jsonb),
  ('Squash the Hunger Chili', 'Canned diced tomatoes', '["canned tomatoes", "diced tomatoes"]'::jsonb, null::jsonb),
  ('Squash the Hunger Chili', 'Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('Squash the Hunger Chili', 'Chili powder', '["chili powder"]'::jsonb, null::jsonb),
  ('Squash the Hunger Chili', 'Ground cumin', '["cumin"]'::jsonb, null::jsonb),
  ('Squash the Hunger Chili', 'Canola oil', '["canola oil", "vegetable oil"]'::jsonb, null::jsonb),
  ('Sticky Chicken, Crisp Apple', 'Chicken Drumsticks', '["chicken drumsticks"]'::jsonb, null::jsonb),
  ('Sticky Chicken, Crisp Apple', 'Honey', '["honey"]'::jsonb, null::jsonb),
  ('Sticky Chicken, Crisp Apple', 'Soy sauce', '["soy sauce"]'::jsonb, null::jsonb),
  ('Sticky Chicken, Crisp Apple', 'Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('Sticky Chicken, Crisp Apple', 'Red Cabbage', '["red cabbage", "cabbage"]'::jsonb, null::jsonb),
  ('Sticky Chicken, Crisp Apple', 'Gala Apples', '["gala apples", "apples"]'::jsonb, null::jsonb),
  ('Sticky Chicken, Crisp Apple', 'Apple cider vinegar', '["apple cider vinegar"]'::jsonb, null::jsonb),
  ('Sticky Chicken, Crisp Apple', 'Canola oil', '["canola oil", "vegetable oil"]'::jsonb, null::jsonb),
  ('Sunday Roast With the Most', 'Only Goodness Whole Fryer Chicken', '["whole chicken"]'::jsonb, null::jsonb),
  ('Sunday Roast With the Most', 'Little Potato Co. Charmers Potatoes', '["baby potatoes", "potatoes"]'::jsonb, null::jsonb),
  ('Sunday Roast With the Most', 'Green Beans', '["green beans"]'::jsonb, null::jsonb),
  ('Sunday Roast With the Most', 'Olive oil', '["olive oil"]'::jsonb, null::jsonb),
  ('Sunday Roast With the Most', 'Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('Sunday Roast With the Most', 'Smoked paprika', '["smoked paprika", "paprika"]'::jsonb, null::jsonb),
  ('Sunday Roast With the Most', 'Salt and pepper', '["salt", "black pepper"]'::jsonb, null::jsonb),
  ('Sundubu Jjigae (Spicy Soft Tofu Stew)', 'Smooth Tofu', '["smooth tofu", "soft tofu"]'::jsonb, null::jsonb),
  ('Sundubu Jjigae (Spicy Soft Tofu Stew)', 'Pork Belly', '["pork belly"]'::jsonb, null::jsonb),
  ('Sundubu Jjigae (Spicy Soft Tofu Stew)', 'Green Zucchini', '["green zucchini", "zucchini"]'::jsonb, null::jsonb),
  ('Sundubu Jjigae (Spicy Soft Tofu Stew)', 'White mushrooms', '["white mushrooms", "mushrooms"]'::jsonb, null::jsonb),
  ('Sundubu Jjigae (Spicy Soft Tofu Stew)', 'Yellow onions', '["yellow onions", "onions"]'::jsonb, null::jsonb),
  ('Sundubu Jjigae (Spicy Soft Tofu Stew)', 'Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('Sundubu Jjigae (Spicy Soft Tofu Stew)', 'Gochugaru (Korean chili flakes)', '["gochugaru", "chili flakes"]'::jsonb, null::jsonb),
  ('Sundubu Jjigae (Spicy Soft Tofu Stew)', 'Soy sauce', '["soy sauce"]'::jsonb, null::jsonb),
  ('Sundubu Jjigae (Spicy Soft Tofu Stew)', 'Fish sauce', '["fish sauce"]'::jsonb, null::jsonb),
  ('Sundubu Jjigae (Spicy Soft Tofu Stew)', 'Chicken broth', '["chicken broth", "broth"]'::jsonb, null::jsonb),
  ('Sundubu Jjigae (Spicy Soft Tofu Stew)', 'Green onions', '["green onions"]'::jsonb, null::jsonb),
  ('Sundubu Jjigae (Spicy Soft Tofu Stew)', 'Canola oil', '["canola oil", "vegetable oil"]'::jsonb, null::jsonb),
  ('Taco Tuesday, Every Day', 'Ground beef', '["ground beef", "lean ground beef", "medium ground beef", "extra lean ground beef", "regular ground beef"]'::jsonb, null::jsonb),
  ('Taco Tuesday, Every Day', 'Black beans', '["black beans", "canned black beans"]'::jsonb, null::jsonb),
  ('Taco Tuesday, Every Day', 'Compliments Sour Cream', '["sour cream"]'::jsonb, '["plain yogurt"]'::jsonb),
  ('Taco Tuesday, Every Day', 'Monsieur Gustav Cheddar', '["cheddar"]'::jsonb, null::jsonb),
  ('Taco Tuesday, Every Day', 'Beefsteak Tomatoes', '["beefsteak tomatoes", "tomatoes"]'::jsonb, null::jsonb),
  ('Taco Tuesday, Every Day', 'Iceberg or Living Lettuce', '["iceberg lettuce", "lettuce"]'::jsonb, null::jsonb),
  ('Taco Tuesday, Every Day', 'Taco shells', '["taco shells"]'::jsonb, null::jsonb),
  ('Taco Tuesday, Every Day', 'Taco seasoning mix', '["taco seasoning"]'::jsonb, null::jsonb),
  ('Taco Tuesday, Every Day', 'Lime', '["limes"]'::jsonb, null::jsonb),
  ('Thanks, It’s Turkey', 'Whole turkey', '["whole turkey", "turkey"]'::jsonb, null::jsonb),
  ('Thanks, It’s Turkey', 'Butter', '["butter"]'::jsonb, null::jsonb),
  ('Thanks, It’s Turkey', 'Dried rosemary', '["rosemary"]'::jsonb, null::jsonb),
  ('Thanks, It’s Turkey', 'Yellow onions', '["yellow onions", "onions"]'::jsonb, null::jsonb),
  ('Thanks, It’s Turkey', 'Celery', '["celery"]'::jsonb, null::jsonb),
  ('Thanks, It’s Turkey', 'Potatoes', '["potatoes"]'::jsonb, null::jsonb),
  ('Thanks, It’s Turkey', 'Milk', '["milk"]'::jsonb, null::jsonb),
  ('Thanks, It’s Turkey', 'Carrots', '["carrots"]'::jsonb, null::jsonb),
  ('Thanks, It’s Turkey', 'Brussels Sprouts', '["brussels sprouts"]'::jsonb, null::jsonb),
  ('Thanks, It’s Turkey', 'Gravy mix', '["gravy mix", "gravy"]'::jsonb, null::jsonb),
  ('Thanks, It’s Turkey', 'Olive oil', '["olive oil"]'::jsonb, null::jsonb),
  ('Thanks, It’s Turkey', 'Salt', '["salt"]'::jsonb, null::jsonb),
  ('The Great Pepper Roast', 'Sweet peppers', '["sweet peppers", "bell peppers", "coloured peppers"]'::jsonb, null::jsonb),
  ('The Great Pepper Roast', 'White kidney beans', '["white kidney beans", "cannellini beans", "canned white kidney beans", "canned cannellini beans"]'::jsonb, null::jsonb),
  ('The Great Pepper Roast', 'Onions', '["yellow onions", "onions"]'::jsonb, null::jsonb),
  ('The Great Pepper Roast', 'Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('The Great Pepper Roast', 'Potatoes', '["potatoes"]'::jsonb, null::jsonb),
  ('The Great Pepper Roast', 'Chicken broth', '["chicken broth", "broth"]'::jsonb, null::jsonb),
  ('The Great Pepper Roast', 'Olive oil', '["olive oil"]'::jsonb, null::jsonb),
  ('The Great Pepper Roast', 'Smoked paprika', '["smoked paprika", "paprika"]'::jsonb, null::jsonb),
  ('The Great Pepper Roast', 'Ground cumin', '["cumin"]'::jsonb, null::jsonb),
  ('The Great Pepper Roast', 'Greek yogurt', '["greek yogurt", "yogurt"]'::jsonb, null::jsonb),
  ('The Great Pepper Roast', 'Heavy cream', '["heavy cream", "whipping cream"]'::jsonb, null::jsonb),
  ('The Great Pepper Roast', 'Butter', '["butter"]'::jsonb, null::jsonb),
  ('The Great Pepper Roast', 'Red wine vinegar', '["red wine vinegar"]'::jsonb, null::jsonb),
  ('The Great Pepper Roast', 'Salt and pepper', '["salt", "black pepper"]'::jsonb, null::jsonb),
  ('TikTok Baked Feta Pasta (with a tofu twist)', 'Feta cheese', '["feta"]'::jsonb, null::jsonb),
  ('TikTok Baked Feta Pasta (with a tofu twist)', 'Firm tofu, pressed', '["firm tofu", "tofu"]'::jsonb, null::jsonb),
  ('TikTok Baked Feta Pasta (with a tofu twist)', 'Cherry tomatoes', '["cherry tomatoes"]'::jsonb, null::jsonb),
  ('TikTok Baked Feta Pasta (with a tofu twist)', 'Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('TikTok Baked Feta Pasta (with a tofu twist)', 'Chili flakes', '["chili flakes"]'::jsonb, null::jsonb),
  ('TikTok Baked Feta Pasta (with a tofu twist)', 'Pasta (penne or rigatoni)', '["penne", "rigatoni", "pasta"]'::jsonb, null::jsonb),
  ('TikTok Baked Feta Pasta (with a tofu twist)', 'Olive oil', '["olive oil"]'::jsonb, null::jsonb),
  ('TikTok Baked Feta Pasta (with a tofu twist)', 'Fresh basil', '["basil"]'::jsonb, null::jsonb),
  ('TikTok Baked Feta Pasta (with a tofu twist)', 'Salt and black pepper', '["salt", "black pepper"]'::jsonb, null::jsonb),
  ('Tomato Soup & Grilled Cheese Remix', 'Sandwich bread', '["sliced bread", "bread"]'::jsonb, null::jsonb),
  ('Tomato Soup & Grilled Cheese Remix', 'Monsieur Gustav Cheddar', '["cheddar"]'::jsonb, null::jsonb),
  ('Tomato Soup & Grilled Cheese Remix', 'Condensed tomato soup', '["tomato soup"]'::jsonb, null::jsonb),
  ('Tomato Soup & Grilled Cheese Remix', 'Eggs', '["eggs"]'::jsonb, null::jsonb),
  ('Tomato Soup & Grilled Cheese Remix', 'Milk', '["milk"]'::jsonb, null::jsonb),
  ('Tomato Soup & Grilled Cheese Remix', 'Unsalted Butter', '["butter"]'::jsonb, null::jsonb),
  ('Tomato Soup & Grilled Cheese Remix', 'Garlic powder', '["garlic powder"]'::jsonb, null::jsonb),
  ('Tomato Soup & Grilled Cheese Remix', 'Black pepper', '["black pepper"]'::jsonb, null::jsonb),
  ('Vermicelli Gets a Spring Roll', 'Wong Wing vegetable spring rolls', '["spring rolls"]'::jsonb, null::jsonb),
  ('Vermicelli Gets a Spring Roll', 'Rice vermicelli noodles', '["rice vermicelli", "rice noodles"]'::jsonb, null::jsonb),
  ('Vermicelli Gets a Spring Roll', 'Carrot', '["carrots"]'::jsonb, null::jsonb),
  ('Vermicelli Gets a Spring Roll', 'Cucumbers', '["cucumber"]'::jsonb, null::jsonb),
  ('Vermicelli Gets a Spring Roll', 'Green onions', '["green onions"]'::jsonb, null::jsonb),
  ('Vermicelli Gets a Spring Roll', 'Cilantro', '["cilantro"]'::jsonb, null::jsonb),
  ('Vermicelli Gets a Spring Roll', 'Peanuts', '["peanuts"]'::jsonb, null::jsonb),
  ('Vermicelli Gets a Spring Roll', 'Frozen edamame', '["edamame", "frozen edamame", "fresh edamame"]'::jsonb, null::jsonb),
  ('Vermicelli Gets a Spring Roll', 'Lime', '["limes"]'::jsonb, null::jsonb),
  ('Vermicelli Gets a Spring Roll', 'Soy sauce', '["soy sauce"]'::jsonb, null::jsonb),
  ('Vermicelli Gets a Spring Roll', 'Rice vinegar', '["rice vinegar"]'::jsonb, null::jsonb),
  ('Vermicelli Gets a Spring Roll', 'Brown sugar', '["brown sugar"]'::jsonb, null::jsonb),
  ('Vermicelli Gets a Spring Roll', 'Sesame oil', '["sesame oil"]'::jsonb, null::jsonb),
  ('Vermicelli Gets a Spring Roll', 'Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('Vermicelli Gets a Spring Roll', 'Chili flakes', '["chili flakes"]'::jsonb, null::jsonb),
  ('Wok This Way Hoisin Pork', 'Pork Stir Fry', '["pork stir fry", "pork tenderloin", "pork shoulder", "pork butt"]'::jsonb, null::jsonb),
  ('Wok This Way Hoisin Pork', 'Tilda Basmati Rice', '["basmati rice", "rice"]'::jsonb, null::jsonb),
  ('Wok This Way Hoisin Pork', 'Lee Kum Kee Hoisin Sauce', '["hoisin sauce"]'::jsonb, null::jsonb),
  ('Wok This Way Hoisin Pork', 'Soy sauce', '["soy sauce"]'::jsonb, null::jsonb),
  ('Wok This Way Hoisin Pork', 'Garlic', '["garlic"]'::jsonb, null::jsonb),
  ('Wok This Way Hoisin Pork', 'Fresh ginger', '["ginger"]'::jsonb, null::jsonb),
  ('Wok This Way Hoisin Pork', 'Green Onions', '["green onions"]'::jsonb, null::jsonb),
  ('Wok This Way Hoisin Pork', 'Vegetable oil', '["vegetable oil", "canola oil"]'::jsonb, null::jsonb)
)
update public.recipes r
set ingredients = (
  select jsonb_agg(
    case when v.recipe is null then e.val
         else e.val || jsonb_build_object('match_tags', v.match_tags)
              || case when v.fallback_tags is not null then jsonb_build_object('fallback_tags', v.fallback_tags) else '{}'::jsonb end
    end order by e.ord)
  from jsonb_array_elements(r.ingredients) with ordinality as e(val, ord)
  left join v on v.recipe = r.name and v.ingredient = e.val->>'name'
)
where r.name in (select recipe from v);

alter table public.recipes enable trigger recipes_set_updated_at;

-- Keeps SECURITY DEFINER and SET statement_timeout = '60s' (see
-- 20261002010000) -- dropping the timeout silently breaks dev-deals saves.
CREATE OR REPLACE FUNCTION public.refresh_recipe_deal_tags(p_published boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '60s'
AS $function$
declare
  rec record;
  ing jsonb;
  deal record;
  best_deal record;
  best_deal_words int;
  staple record;
  new_tags jsonb;
  ing_words text[];
  alias_ing_words text[];
  keyword text;
  keyword_words text[];
  best_keyword_words int;
  matched boolean;
  total numeric;
  best_staple_price numeric;
  best_staple_unit text;
  best_staple_words int;
  scaled numeric;
  tag_price numeric;
  tag_original_price numeric;
  tag_estimated boolean;
  tag_price_estimated boolean;
  tag_contribution numeric;
  new_price numeric;
  matched_deal_ids uuid[] := '{}';
  home_store text;
  cost_new numeric;
  cost_best numeric;
  main_tags text[];
  fallback_tags text[];
  try_tags text[];
  tag_found boolean;
begin
  drop table if exists deal_cache;
  drop table if exists staple_cache;

  create temp table deal_cache on commit drop as
  select id, item_name, chain_name, image_url, price, original_price, product_url,
         price_unit, package_weight_g, package_weight_g_source, fragment_by_weight,
         quantity_estimated, original_price_source, bundle_count, package_volume_ml,
         keyword_matches,
         public.normalize_words(item_name) as deal_words,
         public.deal_match_keys(item_name, keyword_matches) as match_keys
  from public.curated_deals
  where status = 'approved' and usage <> 'deals' and published = p_published;

  create temp table staple_cache on commit drop as
  select 1 as tier_rank, ingredient_name, avg_price, unit,
         public.staple_alias_words(public.normalize_words(ingredient_name)) as staple_words
  from public.statcan_reference_prices
  union all
  select 2 as tier_rank, ingredient_name, avg_price, unit,
         public.staple_alias_words(public.normalize_words(ingredient_name)) as staple_words
  from public.produce_reference_prices
  union all
  select 3 as tier_rank, ingredient_name, avg_price, unit,
         public.staple_alias_words(public.normalize_words(ingredient_name)) as staple_words
  from public.staple_reference_prices
  where checked_by <> 'ai_estimated';

  update public.curated_deals set used_in_recipe = false
    where used_in_recipe = true and published = p_published;

  for rec in select id, ingredients, servings from public.recipes loop
    new_tags := '[]'::jsonb;
    total := 0;

    -- The recipe's home store: the chain with deals for the most of its
    -- ingredients. When the same ingredient is on sale at several chains,
    -- the home store's deal wins over a slightly cheaper one elsewhere, so
    -- one trip covers more of the recipe. No limit on how many stores a
    -- recipe uses -- an item only one chain has on sale still comes from
    -- that chain (Anabelle, 2026-09-30: "Don't limit stores as we are still
    -- very price sensitive. But between two stores e.g. using onions, [use]
    -- the prominent store of the recipe").
    select s.chain_name into home_store from (
      select d.chain_name, count(distinct i.ord) as n
      from jsonb_array_elements(rec.ingredients) with ordinality as i(val, ord)
      join deal_cache d on (
        case when jsonb_array_length(coalesce(i.val->'match_tags', '[]'::jsonb)) > 0 then
          d.match_keys && (public.tag_keys(i.val->'match_tags') || public.tag_keys(i.val->'fallback_tags'))
        else (
        (array_length(d.deal_words, 1) > 0 and d.deal_words <@ public.normalize_words(i.val->>'name'))
        or (d.keyword_matches is not null and exists (
          select 1 from unnest(d.keyword_matches) k
          where array_length(public.normalize_words(k), 1) > 0
            and public.words_loosely_subset(public.normalize_words(k), public.normalize_words(i.val->>'name'))
        ))
        ) end
      )
      group by d.chain_name
      order by n desc, d.chain_name
      limit 1
    ) s;

    for ing in select value from jsonb_array_elements(rec.ingredients) loop
      ing_words := public.normalize_words(ing->>'name');
      matched := false;
      best_deal_words := 0;
      main_tags := public.tag_keys(ing->'match_tags');
      fallback_tags := public.tag_keys(ing->'fallback_tags');

      if coalesce(array_length(main_tags, 1), 0) > 0 then
        -- Tagged ingredient (20261006 recipe match tags): a deal matches
        -- when one of its match_keys equals one of the tags. Cheapest wins
        -- (home store tie-break via prefer_deal). Fallback tags are only
        -- tried when no main tag matches anything.
        tag_found := false;
        for pass in 1..2 loop
          try_tags := case when pass = 1 then main_tags else fallback_tags end;
          exit when tag_found or coalesce(array_length(try_tags, 1), 0) = 0;
          for deal in select * from deal_cache where match_keys && try_tags loop
            if not tag_found then
              cost_new := public.deal_cost_for(deal.price, deal.original_price, deal.price_unit, deal.package_weight_g,
                deal.package_weight_g_source, deal.fragment_by_weight, deal.quantity_estimated,
                ing->>'quantity', ing->>'unit', ing->>'name', deal.bundle_count, deal.package_volume_ml);
              if cost_new is not null then
                best_deal := deal;
                tag_found := true;
              end if;
            elsif public.prefer_deal(deal.chain_name, best_deal.chain_name, home_store,
                public.deal_cost_for(deal.price, deal.original_price, deal.price_unit, deal.package_weight_g,
                  deal.package_weight_g_source, deal.fragment_by_weight, deal.quantity_estimated,
                  ing->>'quantity', ing->>'unit', ing->>'name', deal.bundle_count, deal.package_volume_ml),
                public.deal_cost_for(best_deal.price, best_deal.original_price, best_deal.price_unit, best_deal.package_weight_g,
                  best_deal.package_weight_g_source, best_deal.fragment_by_weight, best_deal.quantity_estimated,
                  ing->>'quantity', ing->>'unit', ing->>'name', best_deal.bundle_count, best_deal.package_volume_ml)) then
              best_deal := deal;
            end if;
          end loop;
        end loop;

        if tag_found then
          select p.tag_price, p.tag_original_price, p.tag_quantity_estimated, p.tag_price_estimated, p.tag_contribution
            into tag_price, tag_original_price, tag_estimated, tag_price_estimated, tag_contribution
          from public.compute_deal_tag_pricing(
            best_deal.price, best_deal.original_price, best_deal.price_unit, best_deal.package_weight_g,
            best_deal.package_weight_g_source, best_deal.fragment_by_weight, best_deal.quantity_estimated,
            ing->>'quantity', ing->>'unit', ing->>'name',
            best_deal.bundle_count, best_deal.package_volume_ml
          ) p;

          if tag_price is not null then
            matched := true;
            matched_deal_ids := array_append(matched_deal_ids, best_deal.id);
            new_tags := new_tags || jsonb_build_object(
              'name', ing->>'name',
              'store', best_deal.chain_name,
              'image_url', best_deal.image_url,
              'product_url', best_deal.product_url,
              'price', tag_price,
              'original_price', tag_original_price,
              'raw_price', best_deal.price,
              'raw_original_price', best_deal.original_price,
              'discount_pct', round((1 - tag_price / nullif(tag_original_price, 0)) * 100),
              'quantity_estimated', tag_estimated,
              'original_price_source', best_deal.original_price_source,
              'price_estimated', tag_price_estimated,
              'fragment_by_weight', best_deal.fragment_by_weight,
              'package_weight_g', best_deal.package_weight_g,
              'price_unit', best_deal.price_unit,
              'deal_item_name', best_deal.item_name,
              'bundle_count', best_deal.bundle_count,
              'package_volume_ml', best_deal.package_volume_ml
            );
            total := total + tag_contribution;
          end if;
        end if;
      else
      for deal in select * from deal_cache loop
        if array_length(deal.deal_words, 1) > 0 and deal.deal_words <@ ing_words then
          if array_length(deal.deal_words, 1) > best_deal_words then
            best_deal := deal;
            best_deal_words := array_length(deal.deal_words, 1);
          -- Tie-break at equal specificity: the home store first, then the
          -- lower price. A genuine elsif, not an OR in the if above -- see
          -- 20260914020000.
          elsif best_deal_words > 0 and array_length(deal.deal_words, 1) = best_deal_words
                and public.prefer_deal(deal.chain_name, best_deal.chain_name, home_store,
                  public.deal_cost_for(deal.price, deal.original_price, deal.price_unit, deal.package_weight_g,
                    deal.package_weight_g_source, deal.fragment_by_weight, deal.quantity_estimated,
                    ing->>'quantity', ing->>'unit', ing->>'name', deal.bundle_count, deal.package_volume_ml),
                  public.deal_cost_for(best_deal.price, best_deal.original_price, best_deal.price_unit, best_deal.package_weight_g,
                    best_deal.package_weight_g_source, best_deal.fragment_by_weight, best_deal.quantity_estimated,
                    ing->>'quantity', ing->>'unit', ing->>'name', best_deal.bundle_count, best_deal.package_volume_ml)) then
            best_deal := deal;
          end if;
        end if;
      end loop;

      if best_deal_words > 0 then
        select p.tag_price, p.tag_original_price, p.tag_quantity_estimated, p.tag_price_estimated, p.tag_contribution
          into tag_price, tag_original_price, tag_estimated, tag_price_estimated, tag_contribution
        from public.compute_deal_tag_pricing(
          best_deal.price, best_deal.original_price, best_deal.price_unit, best_deal.package_weight_g,
          best_deal.package_weight_g_source, best_deal.fragment_by_weight, best_deal.quantity_estimated,
          ing->>'quantity', ing->>'unit', ing->>'name',
          best_deal.bundle_count, best_deal.package_volume_ml
        ) p;

        if tag_price is not null then
          matched := true;
          matched_deal_ids := array_append(matched_deal_ids, best_deal.id);
          new_tags := new_tags || jsonb_build_object(
            'name', ing->>'name',
            'store', best_deal.chain_name,
            'image_url', best_deal.image_url,
            'product_url', best_deal.product_url,
            'price', tag_price,
            'original_price', tag_original_price,
            'raw_price', best_deal.price,
            'raw_original_price', best_deal.original_price,
            'discount_pct', round((1 - tag_price / nullif(tag_original_price, 0)) * 100),
            'quantity_estimated', tag_estimated,
            'original_price_source', best_deal.original_price_source,
            'price_estimated', tag_price_estimated,
            'fragment_by_weight', best_deal.fragment_by_weight,
            'package_weight_g', best_deal.package_weight_g,
            'price_unit', best_deal.price_unit,
            'deal_item_name', best_deal.item_name,
            'bundle_count', best_deal.bundle_count,
            'package_volume_ml', best_deal.package_volume_ml
          );
          total := total + tag_contribution;
        end if;
      end if;

      if not matched then
        best_deal_words := 0;
        best_keyword_words := 0;

        for deal in
          select * from deal_cache
          where keyword_matches is not null and array_length(keyword_matches, 1) > 0
        loop
          foreach keyword in array deal.keyword_matches loop
            keyword_words := public.normalize_words(keyword);
            if array_length(keyword_words, 1) > 0
               and public.words_loosely_subset(keyword_words, ing_words)
            then
              if array_length(keyword_words, 1) > best_keyword_words then
                best_deal := deal;
                best_keyword_words := array_length(keyword_words, 1);
              elsif best_keyword_words > 0 and array_length(keyword_words, 1) = best_keyword_words
                    and public.prefer_deal(deal.chain_name, best_deal.chain_name, home_store,
                      public.deal_cost_for(deal.price, deal.original_price, deal.price_unit, deal.package_weight_g,
                        deal.package_weight_g_source, deal.fragment_by_weight, deal.quantity_estimated,
                        ing->>'quantity', ing->>'unit', ing->>'name', deal.bundle_count, deal.package_volume_ml),
                      public.deal_cost_for(best_deal.price, best_deal.original_price, best_deal.price_unit, best_deal.package_weight_g,
                        best_deal.package_weight_g_source, best_deal.fragment_by_weight, best_deal.quantity_estimated,
                        ing->>'quantity', ing->>'unit', ing->>'name', best_deal.bundle_count, best_deal.package_volume_ml)) then
                best_deal := deal;
              end if;
            end if;
          end loop;
        end loop;

        if best_keyword_words > 0 then
          select p.tag_price, p.tag_original_price, p.tag_quantity_estimated, p.tag_price_estimated, p.tag_contribution
            into tag_price, tag_original_price, tag_estimated, tag_price_estimated, tag_contribution
          from public.compute_deal_tag_pricing(
            best_deal.price, best_deal.original_price, best_deal.price_unit, best_deal.package_weight_g,
            best_deal.package_weight_g_source, best_deal.fragment_by_weight, best_deal.quantity_estimated,
            ing->>'quantity', ing->>'unit', ing->>'name',
            best_deal.bundle_count, best_deal.package_volume_ml
          ) p;

          if tag_price is not null then
            matched := true;
            matched_deal_ids := array_append(matched_deal_ids, best_deal.id);
            new_tags := new_tags || jsonb_build_object(
              'name', ing->>'name',
              'store', best_deal.chain_name,
              'image_url', best_deal.image_url,
              'product_url', best_deal.product_url,
              'price', tag_price,
              'original_price', tag_original_price,
              'raw_price', best_deal.price,
              'raw_original_price', best_deal.original_price,
              'discount_pct', round((1 - tag_price / nullif(tag_original_price, 0)) * 100),
              'quantity_estimated', tag_estimated,
              'original_price_source', best_deal.original_price_source,
              'price_estimated', tag_price_estimated,
              'fragment_by_weight', best_deal.fragment_by_weight,
              'package_weight_g', best_deal.package_weight_g,
              'price_unit', best_deal.price_unit,
              'deal_item_name', best_deal.item_name,
              'bundle_count', best_deal.bundle_count,
              'package_volume_ml', best_deal.package_volume_ml
            );
            total := total + tag_contribution;
          end if;
        end if;
      end if;

      end if;  -- tagged / untagged

      if not matched then
        best_staple_price := null;
        best_staple_unit := null;
        best_staple_words := 0;
        alias_ing_words := public.staple_alias_words(ing_words);

        -- Tagged ingredient: a reference price whose name equals one of
        -- its tags wins first (e.g. `smoked sausages` -> "Smoked sausage",
        -- which the word match below misses on the plural).
        if coalesce(array_length(main_tags, 1), 0) > 0 then
          select sc.avg_price, sc.unit into best_staple_price, best_staple_unit
          from staple_cache sc
          where public.match_norm(sc.ingredient_name) = any(main_tags)
          order by sc.tier_rank
          limit 1;
        end if;

        if best_staple_price is null then
        for staple in select * from staple_cache order by tier_rank loop
          if array_length(staple.staple_words, 1) > 0
             and not (array_length(staple.staple_words, 1) = 1 and staple.ingredient_name ~* '\yfrozen\y')
             and staple.staple_words <@ alias_ing_words
             and array_length(staple.staple_words, 1) > best_staple_words
          then
            best_staple_price := staple.avg_price;
            best_staple_unit := staple.unit;
            best_staple_words := array_length(staple.staple_words, 1);
          end if;
        end loop;
        end if;

        if best_staple_price is not null then
          scaled := public.scale_reference_price(
            coalesce(ing->>'price_quantity', ing->>'quantity'),
            coalesce(ing->>'price_unit', ing->>'unit'),
            ing->>'name',
            best_staple_price, best_staple_unit
          );
          if scaled is not null then
            total := total + scaled;
          end if;
        end if;
      end if;
    end loop;

    new_price := case when rec.servings > 0 then round(total / rec.servings, 2) else round(total, 2) end;
    if p_published then
      update public.recipes set deal_tags = new_tags, price = new_price where id = rec.id;
    else
      update public.recipes set draft_deal_tags = new_tags, draft_price = new_price where id = rec.id;
    end if;
  end loop;

  if array_length(matched_deal_ids, 1) > 0 then
    update public.curated_deals set used_in_recipe = true where id = any(matched_deal_ids);
  end if;
end;
$function$;
