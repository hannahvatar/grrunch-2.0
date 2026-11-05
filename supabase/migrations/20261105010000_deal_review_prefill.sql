-- Faster weekly deal review (Anabelle, 2026-11-05: "It took me the whole
-- day just for deals approval"). The weekly flyer fetch now prepares more
-- of each candidate, and she verifies instead of researching.

-- The fetch's AI estimate of the item's average BC regular price
-- (same methodology as estimate-reference-price), ready for dev-deals to
-- show as the reference to approve when StatCan has no match:
--   {"name": "...", "avg_price": 12.5, "unit": "1 kg" | "1 L" | "1 ea",
--    "reasoning": "..."}
alter table public.curated_deals add column if not exists suggested_reference jsonb;

-- Why the fetch set a candidate aside instead of putting it in "Needs
-- review" (no saving vs the BC average, points-only or member-price
-- offer, rejected every past week). Status stays 'pending', so nothing is
-- lost: dev-deals lists these under "Set aside", where she can still
-- approve or reject any of them. Cleared once she reviews the deal.
alter table public.curated_deals add column if not exists set_aside_reason text;
