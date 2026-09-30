-- "Buy 2 or more" deals (Anabelle, 2026-09-30, on Butterball Turkey
-- Bacon: "$5.99 each if you buy 2 or more"). Not a multi-buy bundle
-- ("2 for $3", bundle_count): the price is per item, but only when the
-- shopper buys at least this many. Null for every ordinary deal.
alter table public.curated_deals
  add column if not exists min_quantity integer;

alter table public.curated_deals
  drop constraint if exists curated_deals_min_quantity_sane;
alter table public.curated_deals
  add constraint curated_deals_min_quantity_sane check (min_quantity is null or min_quantity >= 2);

comment on column public.curated_deals.min_quantity is
  'Minimum number of items the shopper must buy to get this price ("$5.99 each when you buy 2 or more" -> 2). Null for an ordinary deal. Different from bundle_count, which is a multi-buy priced as a bundle ("2 for $3").';
