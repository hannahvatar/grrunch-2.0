-- "Did you know?" card (Anabelle, 2026-10-21): a short note at the bottom
-- of a recipe about an unfamiliar ingredient (what it is, where to find it,
-- what to swap in). The ingredient it's about carries "did_you_know": true
-- in its ingredients JSON and shows a light bulb on the recipe page.
alter table public.recipes add column if not exists did_you_know text;

comment on column public.recipes.did_you_know is
  'Optional "Did you know?" note shown at the bottom of the recipe page. Ingredients with "did_you_know": true in the ingredients JSON get a light bulb icon that jumps to it.';
