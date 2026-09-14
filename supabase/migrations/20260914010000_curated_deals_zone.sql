-- Real gap, caught live (Anabelle, 2026-09-14, re: the new Select-a-Store
-- picker: "We have different zone coverages as banners can change their
-- pricing according to store area... user select a Real Canadian
-- Superstore outside of Burnaby. Are the price still accurate?").
--
-- curated_deals had no way to record which zone a price actually came
-- from, even though Airtable's own "Deals" table already has a real
-- "Zone coverage" field (singleLineText) the 9 zone-review agents set at
-- scan time -- scripts/sync_weekly_deals.py just never read it. This adds
-- the matching column here so that field can finally be synced through.
--
-- Nullable, and expected to STAY null for a real share of rows: a live
-- sample (2026-09-14) showed only ~1/3 of Airtable "Deals" records had
-- "Zone coverage" actually set (older records, or zones where an agent
-- didn't fill it in). app/lib/dealZones.ts's client-side filtering treats
-- null as "unknown, don't exclude" rather than "definitely wrong zone" --
-- see that file's own header comment for why.
alter table public.curated_deals add column zone text;

comment on column public.curated_deals.zone is
  'Airtable Deals table''s "Zone coverage" field, passed through as-is (e.g. "Vancouver (East)", "Hope", "Sechelt", "Victoria" -- matches the city labels in the team''s own flyer-download tracking sheet). Null for older rows or zones an agent didn''t tag. See app/lib/dealZones.ts for how a store gets matched to one of these zone names, and app/lib/curatedDeals.ts for how deals get filtered by it.';
