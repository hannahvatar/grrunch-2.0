-- Time a recipe needs that isn't in `minutes`, shown after it on the
-- recipe page: "120 min, plus soaking" (Anabelle, 2026-10-07), so nobody
-- starts dry beans expecting dinner in two hours. Null shows minutes only.
alter table public.recipes add column if not exists time_note text;
