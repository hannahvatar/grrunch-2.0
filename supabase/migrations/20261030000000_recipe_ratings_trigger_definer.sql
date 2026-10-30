-- Delete account failed for anyone who had rated a recipe (Anabelle,
-- 2026-10-30, on app.grrunch.com). Deleting a user cascades to
-- recipe_ratings, whose delete trigger refreshes recipes.avg_rating. The
-- cascade runs as Supabase Auth's own role (supabase_auth_admin), which may
-- not read recipe_ratings or update recipes, so the whole delete failed.
-- The trigger now runs with its owner's rights, with a fixed search_path.
create or replace function public.recipe_ratings_refresh_aggregate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    perform public.refresh_recipe_rating(old.recipe_id);
    return old;
  end if;
  perform public.refresh_recipe_rating(new.recipe_id);
  return new;
end;
$$;
