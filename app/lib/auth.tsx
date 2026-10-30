import type { Session } from '@supabase/supabase-js';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { supabase } from './supabase';

interface AuthContextValue {
  session: Session | null;
  // True while the initial supabase.auth.getSession() check is in flight --
  // lets a screen avoid flashing "guest" before the real answer is known.
  loading: boolean;
  // No session at all -- whether because the user explicitly chose
  // "Continue as guest" or simply never signed in. Real signed-in state,
  // backed by Supabase's own session (persisted via AsyncStorage, see
  // lib/supabase.ts), not a hardcoded assumption every screen used to make.
  isGuest: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session) dropSessionIfUserGone();
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, isGuest: !session }}>
      {children}
    </AuthContext.Provider>
  );
}

// The saved session is restored without asking the server, so an account
// deleted while its dialog was left open (or from another device) still
// showed "Hi, Anabelle!" after a reload (Anabelle, 2026-10-30). Checked in
// the background: only "this user doesn't exist" signs out, never a
// network error.
async function dropSessionIfUserGone() {
  const { error } = await supabase.auth.getUser();
  if (!error) return;
  const gone = error.code === 'user_not_found' || /does not exist/i.test(error.message);
  if (gone) await supabase.auth.signOut({ scope: 'local' });
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
