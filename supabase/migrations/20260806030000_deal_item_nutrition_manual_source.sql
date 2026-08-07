-- Several deal-tagged ingredients (complex flyer marketing names like
-- "PC® WHOLE CREMINI or WHITE MUSHROOMS, 454 G") don't confidently match
-- anything in Open Food Facts or USDA FoodData Central -- same kind of
-- gap produce_reference_prices already handles by leaving a blank row
-- for a human to fill in by hand (see that table's migration). Allowing
-- source = 'manual' lets deal_item_nutrition_reference do the same
-- instead of only ever accepting an API-sourced row.
alter table public.deal_item_nutrition_reference
  drop constraint deal_item_nutrition_reference_source_check;

alter table public.deal_item_nutrition_reference
  add constraint deal_item_nutrition_reference_source_check
    check (source in ('openfoodfacts', 'usda', 'manual'));
