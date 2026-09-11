import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { useAuth } from './auth';
import { supabase } from './supabase';

// Exported so MembershipStatus's days-left progress bar can compute its
// fill fraction against the same real total this file uses, instead of a
// second hardcoded 30 that could silently drift from this one.
export const TRIAL_DAYS = 30;

type SubscriptionStatus = 'none' | 'trialing' | 'active' | 'expired';

interface SubscriptionContextValue {
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  loading: boolean;
  // Guests are always 'none' -- no account means no subscription row to
  // look up at all (see supabase/migrations/20260803000000_subscriptions.sql).
  // 'trialing' only counts while trial_ends_at hasn't passed; a trial that
  // ran out reads as unsubscribed here even before anything updates its
  // stored status to 'expired'.
  isSubscribed: boolean;
  startTrial: () => Promise<{ error: string | null }>;
  cancelTrial: () => Promise<{ error: string | null }>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatus>('none');
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      setStatus('none');
      setTrialEndsAt(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setStatus((data?.status as SubscriptionStatus) ?? 'none');
        setTrialEndsAt(data?.trial_ends_at ?? null);
        setLoading(false);
      });
  }, [session, authLoading]);

  async function startTrial(): Promise<{ error: string | null }> {
    if (!session) {
      return { error: 'You need an account to start a free trial.' };
    }
    const trialEndsAtValue = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    // upsert, not insert -- user_id is this table's primary key, so a
    // plain insert() fails for anyone who already has a row (their first
    // trial, an active membership, or one that's since expired). Real
    // repro, Anabelle, 2026-09-11: resubscribing after a trial ended threw
    // "duplicate key value violates unique constraint subscriptions_pkey".
    // The matching RLS policy (20260911000000_subscriptions_restart_trial_
    // policy.sql) deliberately only allows the conflict-path UPDATE to
    // land on status = 'trialing', not 'active' -- so this can't be used
    // to grant a free membership, only to restart a trial.
    const { error } = await supabase
      .from('subscriptions')
      .upsert({ user_id: session.user.id, status: 'trialing', trial_ends_at: trialEndsAtValue });
    if (error) {
      return { error: error.message };
    }
    setStatus('trialing');
    setTrialEndsAt(trialEndsAtValue);
    return { error: null };
  }

  // Deletes the row outright rather than updating status -- 'none' isn't
  // a real value this column stores (see the status check constraint in
  // 20260803000000_subscriptions.sql); no row IS 'none', by definition
  // (same logic as a guest never having one at all). The matching RLS
  // policy (20260911010000_subscriptions_cancel_trial_policy.sql) only
  // allows this while status = 'trialing' -- a real paid ('active') row
  // can't be deleted this way, since real cancellation for a paying
  // member has to go through the store's own subscription management,
  // not a raw client-side delete.
  async function cancelTrial(): Promise<{ error: string | null }> {
    if (!session) {
      return { error: 'You need an account to cancel a trial.' };
    }
    const { error } = await supabase.from('subscriptions').delete().eq('user_id', session.user.id);
    if (error) {
      return { error: error.message };
    }
    setStatus('none');
    setTrialEndsAt(null);
    return { error: null };
  }

  const isSubscribed =
    status === 'active' || (status === 'trialing' && !!trialEndsAt && new Date(trialEndsAt) > new Date());

  return (
    <SubscriptionContext.Provider
      value={{ status, trialEndsAt, loading, isSubscribed, startTrial, cancelTrial }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return ctx;
}
