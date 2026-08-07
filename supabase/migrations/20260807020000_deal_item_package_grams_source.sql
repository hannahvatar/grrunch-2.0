-- package_grams (added in the original deal_item_nutrition_reference
-- migration) can come from two very different places: read directly off
-- the product's printed label/flyer text (a real number), or estimated
-- from a typical size for that kind of item when nothing on the flyer
-- states a fixed weight (e.g. meat/produce priced per kg/lb has no
-- fixed package total -- see the chicken breasts and broccoli crown
-- cases worked through in chat). Both are legitimate and already in use,
-- but conflating them loses traceability -- this column keeps them
-- distinguishable, same rigor as reviewed_by/nutrition_source elsewhere
-- in this pipeline.
alter table public.deal_item_nutrition_reference
  add column package_grams_source text check (package_grams_source in ('label', 'estimated'));

comment on column public.deal_item_nutrition_reference.package_grams_source is
  'label = read directly off the product packaging/flyer text. estimated = typical size for this kind of item, used when the flyer only shows a per-kg/per-lb rate with no fixed package total. Null for rows with no package_grams at all.';

update public.deal_item_nutrition_reference set package_grams_source = 'label' where item_name in (
  'Great Value smoked sausages', 'Bulacan Sweet Longanisa', 'Marinated Eggs',
  'Watermelon (Seedless)', 'Nature''s Path Honey''D corn flakes', 'CAULIFLOWER',
  'Country Harvest grain bread', 'Marcangelo Chicken Breast Souvlaki kabobs',
  'Samlip Fresh Udon', 'Mr. Noodles instant noodles', 'Small Bar Cakes',
  'Glico Pocky', 'Post Shreddies Honey cereal', 'Nutella biscuits',
  'Boursin cheese', 'Reese''s Pieces candy', 'Heinz ketchup', 'GREEN ONIONS',
  'Huy Fong Hot Chili Sauce', 'Tostitos Restaurant Style chips',
  'Sensible Portions Garden Veggie Straws', 'Lay''s Classic chips',
  'NO NAME® NATURALLY IMPERFECT™ SWEET PEPPERS, 2.5 LB',
  'PC® WHOLE CREMINI or WHITE MUSHROOMS, 454 G', 'Grace sardines in tomato sauce'
) and package_grams is not null;

update public.deal_item_nutrition_reference set package_grams_source = 'estimated' where item_name in (
  'Prime raised without antibiotics boneless skinless chicken breasts',
  'Marcangelo fresh pork kabobs', 'Swiss Chalet fully cooked pork back ribs',
  'Schneiders Original Recipe wieners', 'Broccoli Crown', 'Bunched Spinach', 'KALE'
);
