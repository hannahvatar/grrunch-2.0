-- Real bug in the previous migration's trigger, caught live: Anabelle,
-- viewing dev-recipes after the "sort by updated_at" fix, still had to
-- scroll to find her most recently edited recipe. Root cause --
-- refresh_recipe_deal_tags()/refresh_recipe_nutrition() run a real
-- UPDATE against EVERY recipe row on EVERY call (even when the
-- recomputed price/calories/protein/deal_tags come out byte-identical
-- to what was already there), and the generic set_updated_at() trigger
-- bumped updated_at on every one of those, unconditionally. Both
-- functions get called after nearly every recipe edit this session --
-- so within minutes of the previous migration landing, all 31 recipes
-- had been stamped with the exact same updated_at (confirmed: a single
-- shared microsecond-precision timestamp across the whole catalog),
-- making "newest first" pure tie-order, unrelated to actual edit
-- recency.
--
-- Fix: a recipes-specific trigger function that only bumps updated_at
-- when a human-authored CONTENT column actually changed (ingredients,
-- instructions, name, servings, minutes, optional_additions, source,
-- source_deal_ids) -- never for the DERIVED columns
-- (price/calories/protein/deal_tags) the refresh functions write on
-- every call. When nothing content-wise changed, updated_at is left
-- exactly as it was, so a routine recompute can never masquerade as a
-- real edit again.
create or replace function public.set_recipes_updated_at()
returns trigger
language plpgsql
as $$
begin
  if new.ingredients is distinct from old.ingredients
     or new.instructions is distinct from old.instructions
     or new.name is distinct from old.name
     or new.servings is distinct from old.servings
     or new.minutes is distinct from old.minutes
     or new.optional_additions is distinct from old.optional_additions
     or new.source is distinct from old.source
     or new.source_deal_ids is distinct from old.source_deal_ids
  then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

comment on function public.set_recipes_updated_at() is
  'BEFORE UPDATE trigger for recipes only -- bumps updated_at to now() ONLY when a human-authored content column changed (ingredients/instructions/name/servings/minutes/optional_additions/source/source_deal_ids), never for the derived columns (price/calories/protein/deal_tags) that refresh_recipe_deal_tags()/refresh_recipe_nutrition() rewrite on every call regardless of whether the value actually changed. Replaces the generic set_updated_at() for this table specifically -- that function stays in place for any other table with simpler update semantics.';

-- Drop the old (generic, unconditional) trigger before repairing the
-- data below -- these repair UPDATEs must run with NO trigger attached
-- at all, or the very trigger being installed would immediately
-- overwrite the "Sticky Fingers Chicken" exception a few statements
-- down (its own content-diff would see no OTHER column change in that
-- update and reset updated_at right back to created_at).
drop trigger if exists recipes_set_updated_at on public.recipes;

-- Repair the damage: every row's updated_at was clobbered to the same
-- bulk-refresh timestamp, so it no longer reflects real edit history
-- for anyone. Reset to created_at (the honest "no real edit captured"
-- baseline).
update public.recipes set updated_at = created_at;

-- One deliberate, honest exception: Sticky Fingers Chicken really was
-- rewritten today (name, ingredients, instructions, optional_additions
-- all changed multiple times), just before any trigger existed to
-- capture it -- this is the exact recipe Anabelle was looking for at
-- the top. Reflects real, already-completed work rather than losing it
-- to the reset above.
update public.recipes set updated_at = now()
  where name = 'Sticky Fingers Chicken';

-- Now attach the corrected, content-aware trigger -- everything from
-- here forward is handled automatically and correctly.
create trigger recipes_set_updated_at
  before update on public.recipes
  for each row
  execute function public.set_recipes_updated_at();
