-- Recipe photos move online (Anabelle, 2026-10-15): they were bundled in
-- the app (app/lib/recipeImages.ts), so every new recipe's photo needed a
-- new TestFlight build. Now each recipe links to its photo in a public
-- storage bucket, uploaded with scripts/upload_recipe_photo.py, and shows
-- on phones right away. The bundled photos stay as a fallback for builds
-- that predate this.
alter table public.recipes add column if not exists image_url text;

comment on column public.recipes.image_url is
  'Public URL of the recipe photo in the recipe-photos bucket. Set by scripts/upload_recipe_photo.py. Null falls back to the photo bundled in the app, then the placeholder.';

insert into storage.buckets (id, name, public)
values ('recipe-photos', 'recipe-photos', true)
on conflict (id) do nothing;
