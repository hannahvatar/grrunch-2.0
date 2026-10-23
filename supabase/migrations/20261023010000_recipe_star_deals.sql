-- Anabelle (2026-10-23): she picks which deals a recipe's Home card
-- features ("star" deals). The biggest percentages aren't always the
-- deal that sells the recipe (Chop Chop Saigon: the pork, not the carrots
-- or rice). Holds up to 2 deal-tagged ingredient names (deal_tags[].name),
-- in display order; empty means "fall back to the two biggest savings".
-- Set from dev-recipes via the set-recipe-star-deals Edge Function.
alter table public.recipes
  add column star_deals text[] not null default '{}';

alter table public.recipes
  add constraint recipes_star_deals_max_two check (cardinality(star_deals) <= 2);

comment on column public.recipes.star_deals is
  'Up to 2 deal-tagged ingredient names (matching deal_tags[].name) featured on this recipe''s Home card, in order. Empty = the two biggest savings.';
