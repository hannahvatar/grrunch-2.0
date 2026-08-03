import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

import type { Database } from '../types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — copy .env.example to .env and fill in your Supabase project values.'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Lets the client auto-detect and complete a session from the URL
    // fragment on web -- needed for the email confirmation/magic link
    // flow (see login.tsx), which redirects back with access/refresh
    // tokens in the URL rather than a code. This SDK check only looks at
    // window.location, so it's a no-op on native (see login.tsx's own
    // expo-linking listener for the native equivalent).
    detectSessionInUrl: true,
  },
});
