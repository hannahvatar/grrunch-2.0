-- Anabelle: "add back the companion recipe AND DONT MENTION IT
-- ANYWHERE IN THIS RECIPE" -- the existing sub_recipes matching is
-- purely text-based (an ingredient line OR Optional-callout prose
-- naming match_ingredient_name), which cannot express "attach this
-- companion to this recipe, full stop, independent of what the
-- recipe's own text says". Every round of "hide the bullet"/"unlink
-- it"/"relink it" this session has been fighting that same limitation.
--
-- Adds a direct, explicit attachment: sub_recipes.recipe_id, nullable
-- FK to recipes.id. NULL (the default, and every existing row today)
-- keeps the current text-matching behavior unchanged -- a reusable
-- technique like "Basic Crispy Pork Belly" or "Cauliflower Rice"
-- should still auto-attach to ANY future recipe naming "Pork belly"/
-- "Cauliflower", not be pinned to one. Setting recipe_id pins a
-- sub-recipe to exactly one recipe, shown there regardless of any
-- text match -- the right shape for a recipe-specific companion like
-- Quick Cucumber Pickles, which isn't a generic technique other
-- recipes should ever auto-inherit.
alter table public.sub_recipes
  add column recipe_id uuid references public.recipes(id) on delete cascade;

comment on column public.sub_recipes.recipe_id is
  'Optional direct attachment to exactly one recipe -- shown on that recipe''s page regardless of any ingredient-name or Optional-text match. NULL (the default) keeps the original text-matching behavior, for reusable techniques (e.g. "Basic Crispy Pork Belly") meant to auto-attach to any recipe naming the matching ingredient, not just one.';
