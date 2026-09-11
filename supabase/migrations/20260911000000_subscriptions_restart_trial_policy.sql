-- Real bug, found live (Anabelle, 2026-09-11): resubscribing after a trial
-- has ended is completely broken. startTrial() (lib/subscription.tsx) does
-- a plain insert(), and user_id is this table's primary key -- so anyone
-- who already has a row (their first-ever trial, active membership, or an
-- expired one) hits "duplicate key value violates unique constraint
-- subscriptions_pkey" the moment they try to start another one. Every real
-- user whose trial lapses would hit this wall trying to resubscribe.
--
-- The fix on the app side is switching that insert() to an upsert() -- but
-- an upsert's conflict path is an UPDATE under the hood, and this table
-- has never had an update policy at all (only select + insert, see
-- 20260803000000_subscriptions.sql), so RLS would still block it.
--
-- This policy is deliberately narrower than "users can update their own
-- row" -- the `with check` pins the result to status = 'trialing' so a
-- user can only ever restart a trial on themselves, never set their own
-- row to 'active' (that stays exclusively a service-role write, via
-- RevenueCat's webhook -- see 20260812030000_revenuecat_subscriptions.sql).
-- Otherwise this would be a real "grant myself free membership forever"
-- hole reachable directly through the anon key + a user's own JWT,
-- independent of whatever the app's own client code happens to send.
create policy "users can restart their own trial" on public.subscriptions
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id and status = 'trialing');
