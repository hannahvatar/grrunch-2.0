-- Companion to 20260911000000_subscriptions_restart_trial_policy.sql --
-- that one let a user restart their own trial; this lets them cancel one,
-- for the new "Cancel trial" button on the trialing membership card
-- (Anabelle, 2026-09-11: "it says cancel anytime but we dont offer the
-- option").
--
-- cancelTrial() (lib/subscription.tsx) deletes the row outright rather
-- than updating status to some "cancelled" value -- there isn't one; 'none'
-- is represented by having no row at all, same as a guest. `using` is
-- scoped to status = 'trialing' specifically, same reasoning as the
-- restart policy's `with check`: a real paid ('active') row must stay
-- undeletable this way. Real cancellation for a paying member has to go
-- through the store's own subscription management and RevenueCat's
-- webhook (service role, bypasses RLS) -- a raw client-side delete would
-- let a paying member wipe Grrunch's own billing record while the store
-- keeps charging them, leaving the two permanently out of sync.
create policy "users can cancel their own trial" on public.subscriptions
  for delete using (auth.uid() = user_id and status = 'trialing');
