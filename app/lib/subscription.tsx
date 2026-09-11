import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon } from 'react-native-heroicons/outline';

import { useAuth } from './auth';
import { supabase } from './supabase';

// Exported so MembershipStatus's days-left progress bar can compute its
// fill fraction against the same real total this file uses, instead of a
// second hardcoded 30 that could silently drift from this one.
export const TRIAL_DAYS = 30;

export type SubscriptionStatus = 'none' | 'trialing' | 'active' | 'expired';

// Shared by MembershipStatus.tsx's own days-left calc and
// NotificationBell.tsx's re-prompt logic (Anabelle, 2026-09-11: "the
// notification should prompt again" as the trial nears its end) -- both
// used to duplicate this exact formula; one copy here instead of two
// that could drift.
export function getTrialDaysLeft(status: SubscriptionStatus, trialEndsAt: string | null): number | null {
  return status === 'trialing' && trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null;
}

export type TrialUrgencyTier = 'success' | 'warning' | 'error';

// Thresholds (Anabelle, 2026-09-11): >7 days is no-urgency success, 3-7
// days is a warning (same "one week left" mental model most trial-
// reminder emails already use), 0-2 days is error -- genuinely urgent,
// about to lose access. Shared by MembershipStatus.tsx's progress bar/
// badge and NotificationBell.tsx's badge/re-prompt key -- both need the
// exact same tier boundaries, so this is the one place they're defined.
export function getTrialUrgencyTier(daysLeft: number | null): TrialUrgencyTier {
  if (daysLeft !== null && daysLeft <= 2) return 'error';
  if (daysLeft !== null && daysLeft <= 7) return 'warning';
  return 'success';
}

// The GRRUNCH DS's real success/warning/error variants (Figma "Mobile
// Alert Banners", node 4076-104 -- same spec AlertBanner.tsx already
// implements). Exported so NotificationBell.tsx's badges use the exact
// same colors as MembershipStatus.tsx's progress bar (Anabelle,
// 2026-09-11: "match the color schema... for the notification badges"),
// not a second, easily-drifting copy of the same three colors.
export const TRIAL_URGENCY_STYLES: Record<
  TrialUrgencyTier,
  { bg: string; strong: string; Icon: typeof CheckCircleIcon }
> = {
  success: { bg: '#E8F5E9', strong: '#1E7B34', Icon: CheckCircleIcon },
  warning: { bg: '#FFF4E5', strong: '#93450B', Icon: ExclamationTriangleIcon },
  error: { bg: '#FDECEC', strong: '#B42318', Icon: XCircleIcon },
};

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
