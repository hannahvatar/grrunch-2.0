-- A plain one-line description shown under a recipe's fun title, on the
-- Meals cards and the recipe page (Anabelle, 2026-10-06: "I love the fun
-- titles and want to keep them but I think recipes needs a
-- straightforward descriptor"). e.g. "Eggplant Got Beef" -> "Garlicky
-- beef and eggplant stir-fry with rice".
alter table public.recipes add column if not exists descriptor text;
