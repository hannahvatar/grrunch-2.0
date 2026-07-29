-- Replaces the free-floating "portions per recipe" the user picked on the
-- Plan screen (totally decoupled from what a recipe's real ingredients
-- actually yield) with a fixed, honest servings count per recipe -- how
-- many portions you actually get from buying the ingredients as sold
-- (e.g. a club-size chicken breast pack yields far more than a small
-- recipe-card quantity would suggest). Portions are no longer a free
-- user choice; they're a real property of the recipe.
alter table public.recipes add column servings integer not null default 1 check (servings > 0);

comment on column public.recipes.servings is
  'Real number of portions this recipe yields, based on the actual package/bulk size of its anchor ingredient(s) -- not an arbitrary user-chosen quantity.';
