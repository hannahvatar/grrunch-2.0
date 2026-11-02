import { useEffect, useState } from 'react';

import { useAuth } from './auth';
import { supabase } from './supabase';

// Whether the signed-in account may use the review pages (dev-deals,
// dev-recipes). They used to only run on localhost (__DEV__); since
// 2026-11-02 they run on the live site too, so Anabelle can review from
// her phone, and only for accounts in public.admins
// (supabase/migrations/20261103000000_admins.sql). RLS lets a user read
// their own row only, so a row coming back means admin.
//
// This only decides what the page shows. The real lock is on the
// server: every review Edge Function checks the same table itself
// (supabase/functions/_shared/admin.ts).
//
// 'loading' until the answer is known, so the page doesn't flash
// "not found" first.
export function useIsAdmin(): boolean | 'loading' {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user.id ?? null;
  const [isAdmin, setIsAdmin] = useState<boolean | 'loading'>('loading');

  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    setIsAdmin('loading');
    supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setIsAdmin(!!data);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, userId]);

  return isAdmin;
}
