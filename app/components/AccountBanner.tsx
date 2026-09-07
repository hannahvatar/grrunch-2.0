import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

// GRRUNCH DS accent -- matches login.tsx/index.tsx's palette.
const ACCENT = '#FFA955';
const INK = '#111';

// Shared guest/signed-in banner, used on both Meals and Profile -- reflects
// the real Supabase session (see lib/auth.tsx) instead of a hardcoded
// "Browsing as guest" every screen used to show regardless of actual state.
export function AccountBanner() {
  const { session, isGuest } = useAuth();

  if (isGuest) {
    return (
      <View style={styles.banner}>
        <Text style={styles.text}>Browsing as guest</Text>
        <Pressable
          style={({ pressed }) => [styles.signUpButton, pressed && styles.signUpButtonPressed]}
          onPress={() => router.push('/login')}
          hitSlop={8}
        >
          <Text style={styles.signUpButtonText}>Sign up</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.banner}>
      <Text style={styles.text} numberOfLines={1}>
        Signed in as {session?.user.email ?? 'you'}
      </Text>
      <Pressable onPress={() => supabase.auth.signOut()} hitSlop={8}>
        <Text style={styles.link}>Log out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingRight: 14,
    gap: 12,
  },
  text: { color: '#111', flexShrink: 1 },
  link: { fontWeight: '700', fontFamily: 'OpenSans_700Bold', textDecorationLine: 'underline' },
  // Same pill-button convention as the app's other primary actions
  // (login.tsx's primaryButton etc.) -- scaled down to fit inline in this
  // banner row instead of the full-width 56pt version.
  signUpButton: {
    backgroundColor: ACCENT,
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  signUpButtonPressed: { borderWidth: 2 },
  signUpButtonText: { color: INK, fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
});
