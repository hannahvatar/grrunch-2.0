-- scripts/sync_deal_nutrition.py's word-overlap matching lets real wrong
-- matches through (confirmed against known values after the first sync:
-- e.g. "GREEN ONIONS" matched to a product reporting 590 kcal/100g when
-- real green onions are ~32; "Small Bar Cakes" matched to something
-- reporting 40g protein/100g, clearly a protein supplement, not a cake).
-- Same shape of problem staple_reference_prices already solves with its
-- checked_by column -- a human has to actually look at and confirm a row
-- before anything is allowed to trust it, rather than believing whatever
-- the API returned. Every row synced so far (and every future one) starts
-- unreviewed; Phase 2 (wiring this into scaleMealToTargets) must only
-- ever read rows where reviewed_by is not null.
alter table public.deal_item_nutrition_reference
  add column reviewed_by text;

comment on column public.deal_item_nutrition_reference.reviewed_by is
  'Null until a human has checked this row''s calories_per_100g/protein_per_100g against a real source and confirmed it -- the API match alone (source/barcode) is not enough to trust, see migration header. Nothing in the app should read a row where this is null.';
