-- Extends subscriptions for real RevenueCat-driven purchases (in-app
-- purchases via Apple/Google, no Stripe -- see this session's Stripe-vs-
-- IAP discussion). trial_ends_at was NOT NULL because only the free-
-- trial path (startTrial()) ever wrote a row before now; a real IAP
-- purchase reported by RevenueCat's webhook has its own renewal date
-- (expires_at) and may have skipped the app's own trial insert entirely
-- (e.g. Apple/Google's OWN introductory-offer trial, reported as a
-- regular purchase event) -- so trial_ends_at must become optional.
alter table public.subscriptions
  alter column trial_ends_at drop not null;

alter table public.subscriptions
  add column expires_at timestamptz,
  add column product_id text,
  add column updated_at timestamptz not null default now();

comment on column public.subscriptions.expires_at is
  'Current subscription period end / next renewal date, as reported by RevenueCat -- distinct from trial_ends_at (the app''s own 30-day free-trial path). Null until a real purchase or renewal event has been received.';
comment on column public.subscriptions.product_id is
  'RevenueCat/store product identifier for the plan the user is on (e.g. the Grrunch Plus monthly SKU) -- only one plan exists today, but this avoids a schema change if a 2nd tier is ever added.';

-- RevenueCat's webhook writes via the service-role key (bypasses RLS
-- entirely, same pattern as every other Edge Function writing to a
-- table with no public write policy for this kind of update) -- no new
-- RLS policy needed. The existing "users can start their own trial"
-- insert policy is untouched; a real purchase upserts via service role
-- regardless of whether a trial row already exists for that user.
