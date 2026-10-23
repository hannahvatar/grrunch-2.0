-- Anabelle (2026-10-23): "sometimes I want to be able to choose 3" star
-- deals for a recipe's Home card. Raises the cap from 2
-- (20261023010000_recipe_star_deals.sql) to 3.
alter table public.recipes drop constraint recipes_star_deals_max_two;

alter table public.recipes
  add constraint recipes_star_deals_max_three check (cardinality(star_deals) <= 3);

comment on column public.recipes.star_deals is
  'Up to 3 deal-tagged ingredient names (matching deal_tags[].name) featured on this recipe''s Home card, in order. Empty = the two biggest savings.';
