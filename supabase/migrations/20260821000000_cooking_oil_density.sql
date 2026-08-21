-- "Cooking oil" has its own real staple_reference_prices row (aliased
-- as a full data-duplicate of Vegetable oil, including nutrition), but
-- refresh_recipe_nutrition()'s staple-fallback tier only ever
-- word-matches an ingredient's OWN words against staple_densities, and
-- "cooking" is a different word from "vegetable" -- so a tbsp/tsp/cup
-- quantity of "Cooking oil" had no density bridge to reach the fixed
-- 100 g nutrition basis at all, silently contributing 0 calories/0
-- protein despite pricing correctly (price scales mL-to-mL directly,
-- no density needed there -- same bug class as Vegetable oil/Milk/
-- Ketchup/Soy sauce before it, just never generalized to this alias).
--
-- Already in live use before this fix: Curry Up Coconut Chicken's
-- "1 tbsp Cooking oil" has been silently under-crediting its nutrition
-- since that recipe was built -- a missing ~120 kcal contribution
-- split across 4 servings isn't obviously wrong by eye. Found while
-- building Sticky Honey-Garlic Chicken Drumsticks, which also uses
-- Cooking oil. Same density as its Vegetable oil twin.
insert into public.staple_densities (ingredient_name, grams_per_cup) values
  ('Cooking oil', 218);

-- Materialize immediately. Expect Curry Up Coconut Chicken's calories
-- to tick up (the only existing recipe using Cooking oil); every other
-- recipe should be byte-identical.
select public.refresh_recipe_nutrition();
