import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';

import { useAuth } from './auth';
import { supabase } from './supabase';

// Consent for the weekly "new deals are live" email (Anabelle,
// 2026-11-03). Canada's anti-spam law needs a real action, so the box on
// the sign-up screen starts unticked; ticking it, or turning on Profile >
// Notifications > Email > Recommendations, records it in
// public.email_consents (supabase/migrations/20261104000000_weekly_email
// .sql) with the time. supabase/functions/send-weekly-email reads it.
//
// The sign-up box is ticked BEFORE there's an account (Google and Apple
// leave the page, email sign-in finishes from the link), so the choice is
// kept on this device until a session appears, then saved.
const PENDING_KEY = 'grrunch.weeklyEmailOptIn';

export async function rememberWeeklyEmailOptIn(on: boolean): Promise<void> {
  try {
    if (on) await AsyncStorage.setItem(PENDING_KEY, new Date().toISOString());
    else await AsyncStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage blocked: they can still turn it on in Profile.
  }
}

export async function fetchWeeklyEmailConsent(userId: string): Promise<boolean> {
  const { data } = await supabase.from('email_consents').select('weekly_deals').eq('user_id', userId).maybeSingle();
  return data?.weekly_deals ?? false;
}

export async function setWeeklyEmailConsent(
  userId: string,
  on: boolean,
  source: 'signup' | 'profile',
  at: string = new Date().toISOString()
): Promise<{ error: string | null }> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('email_consents')
    .upsert(
      on
        ? { user_id: userId, weekly_deals: true, consented_at: at, source, unsubscribed_at: null, updated_at: now }
        : { user_id: userId, weekly_deals: false, unsubscribed_at: now, updated_at: now },
      { onConflict: 'user_id' }
    );
  return { error: error?.message ?? null };
}

// Mounted once in app/_layout.tsx: saves a ticked sign-up box as soon as
// the account exists.
export function useApplyPendingWeeklyEmailOptIn() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId) return;
    (async () => {
      let ticked: string | null = null;
      try {
        ticked = await AsyncStorage.getItem(PENDING_KEY);
      } catch {
        return;
      }
      if (!ticked) return;
      const { error } = await setWeeklyEmailConsent(userId, true, 'signup', ticked);
      if (!error) await rememberWeeklyEmailOptIn(false);
    })();
  }, [userId]);
}
