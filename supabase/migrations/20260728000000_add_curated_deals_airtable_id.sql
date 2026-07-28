-- Stable upsert key for syncing curated_deals from the Airtable Admin
-- Review Tool (architecture.md section 3, step 4 "publish"). Airtable
-- record IDs don't change once a row exists, so this lets repeat syncs
-- update the same row instead of duplicating it.
alter table public.curated_deals add column airtable_record_id text unique;
