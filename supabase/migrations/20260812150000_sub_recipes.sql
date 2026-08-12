-- "Sub-recipes" -- standalone prep techniques a main recipe's own
-- ingredient list can link out to (e.g. "Pork belly" in Instant Pork
-- Ramen Soup jumps to a basic crispy pork belly method at the bottom of
-- the page). Anabelle: "we should probably save them somewhere as they
-- will come up often" -- a genuinely reusable, shared table, matched by
-- ingredient name the same way every other reference table in this app
-- already is (curated_deals, staple_reference_prices, ...), rather than
-- embedded per-recipe -- so any FUTURE recipe naming an ingredient
-- "Pork belly" automatically picks up the same link with zero
-- per-recipe configuration, and the technique is authored exactly once.
--
-- Deliberately NOT read by refresh_recipe_deal_tags/refresh_recipe_
-- nutrition -- purely page content, never priced or nutrition-counted
-- on its own. The SAME-named ingredient in a recipe's own `ingredients`
-- array still prices/counts normally against the staple reference
-- chain, completely independently of this table.
create table public.sub_recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  -- Case-insensitive exact match against a main recipe's own
  -- ingredient `name` -- unique so a given ingredient name can never
  -- ambiguously link to two different sub-recipes.
  match_ingredient_name text not null unique,
  description text not null,
  -- Plain strings, not {name, quantity, unit} -- these are never
  -- priced/matched against any reference table, just shown as a bullet
  -- list for the technique itself.
  ingredients jsonb not null default '[]'::jsonb,
  instructions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.sub_recipes enable row level security;

create policy "sub_recipes are publicly readable" on public.sub_recipes
  for select using (true);

comment on table public.sub_recipes is
  'Standalone prep techniques (e.g. "Basic Crispy Pork Belly") linked from any main recipe naming a matching ingredient -- see match_ingredient_name. Rendered as its own section at the bottom of the recipe page, with the matching ingredient in "What you''ll need" acting as a jump link to it. Never read by refresh_recipe_deal_tags/refresh_recipe_nutrition.';

insert into public.sub_recipes (title, match_ingredient_name, description, ingredients, instructions) values (
  'Basic Crispy Pork Belly',
  'Pork belly',
  'This simple preparation gives you a neutral, crispy pork belly that can easily be repurposed across a variety of recipes, helping you get more bang for your buck.',
  '["Pork belly, skin-on or skinless", "Salt"]'::jsonb,
  '[
    "Preheat oven to 325°F / 165°C.",
    "Pat the pork belly very dry and season generously with salt on all sides.",
    "Place fat/skin side up on a rack over a baking sheet or roasting dish.",
    "Roast for 1½–2 hours, depending on thickness, until tender.",
    "Increase oven temperature to 450°F / 230°C.",
    "Roast for another 15–25 minutes, until deeply browned and crispy.",
    "Rest for 10–15 minutes before slicing."
  ]'::jsonb
);
