-- Anabelle's idea: a recipe can suggest an optional side/addition
-- (e.g. "Roasted Lemon Asparagus" alongside the Boursin mushroom
-- chicken skillet) that's purely descriptive -- not an ingredient
-- line, not priced, not counted toward calories/protein, no deal_tag,
-- no quantity. It's a serving suggestion, not part of the recipe's
-- costed content.
--
-- Same jsonb-array shape as ingredients/instructions (a recipe can
-- have zero, one, or several), but deliberately NOT merged into
-- `ingredients` -- refresh_recipe_deal_tags()/refresh_recipe_
-- nutrition() iterate every element of `ingredients` and would price/
-- nutrition-count anything living there. Keeping this as its own
-- column is what makes "we would not price it" actually true, not
-- just a UI choice.
alter table public.recipes
  add column optional_additions jsonb not null default '[]'::jsonb;

comment on column public.recipes.optional_additions is
  'Optional, unpriced serving suggestions shown at the bottom of the recipe page -- e.g. {"title": "Roasted Lemon Asparagus", "description": "..."}. Never read by refresh_recipe_deal_tags()/refresh_recipe_nutrition() -- purely descriptive, no quantity, no price, no nutrition contribution, by design.';
