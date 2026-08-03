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

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
