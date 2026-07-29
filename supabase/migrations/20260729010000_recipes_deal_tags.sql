-- Replaces the free-text `tag` field (e.g. "Chicken breast · 38% off ·
-- Broccoli · 33% off") with structured, per-ingredient deal tags so the
-- app can render one tag per real deal instead of one blended string --
-- and so the discount percentage is real data, not embedded text.
alter table public.recipes add column deal_tags jsonb;
alter table public.recipes drop column tag;

comment on column public.recipes.deal_tags is
  'Array of {name, discount_pct} for each ingredient sourced from a real curated_deals item -- discount_pct computed from that deal''s price/original_price, never modeled.';
