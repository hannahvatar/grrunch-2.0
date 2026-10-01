-- A short note shown under a recipe's instructions -- tips that aren't a
-- cooking step, like how to freeze leftovers (Anabelle, 2026-10-01: "This
-- is not a step. Make it a note").
alter table public.recipes add column if not exists notes text;
