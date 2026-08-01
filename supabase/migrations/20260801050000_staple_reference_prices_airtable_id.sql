-- staple_reference_prices predates the Airtable-driven gap-filling
-- pattern (unlike produce_reference_prices, which was built with it from
-- the start) -- adds the same airtable_record_id column so a human's
-- approved entry in "Staple Reference Gaps" can be upserted safely
-- (insert once, update in place on re-sync) instead of risking a
-- duplicate row per sync run.
alter table public.staple_reference_prices
  add column if not exists airtable_record_id text unique;

comment on column public.staple_reference_prices.airtable_record_id is
  'Ties back to the originating "Staple Reference Gaps" Airtable row for rows added via that flow (checked_by = human_verified). Null for the original AI-estimated rows.';
