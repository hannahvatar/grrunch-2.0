import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../lib/auth';
import { GrrunchMascot } from './GrrunchMascot';
import { PersonIcon } from './MaterialSymbols';

const ACCENT = '#FFA955';
const INK = '#111';

// Persistent sticky top nav (Anabelle, 2026-09-08) -- lives in
// (tabs)/_layout.tsx, outside the <Tabs> navigator itself, so it's one
// single instance that never remounts/scrolls away as you switch between
// Meals/Weekly Deals/My list/Profile. Deliberately scoped to just the 4
// tabbed screens, not the whole app (onboarding/login/every modal already
// have their own close/back buttons -- a second bar there would clash,
// not help).
//
// Replaces AccountBanner on Meals/Profile (Anabelle's call) -- this is
// now the one place showing guest Sign in/Sign up or the signed-in
// profile shortcut, instead of that plus a second inline banner repeating
// the same auth actions further down the page.
export function AppTopBar() {
  const { isGuest } = useAuth();

  return (
    <View style={styles.bar}>
      {/* No crumbs here (Anabelle's call) -- at this small size the
          floating dots outside the face read as stray specks, not a
          flourish. terms.tsx's big logo lockup keeps them (default on).
          Sized to match the Sign up button's own height (~34px: its
          paddingVertical:7*2 + borderWidth:1.5*2 + its text line height),
          not an arbitrary icon size. */}
      <GrrunchMascot size={34} showCrumbs={false} />
      {isGuest ? (
        <View style={styles.authButtons}>
          {/* Same screen either way (login.tsx) -- Apple/Google/email all
              use one request to create or sign into an account, so
              there's no separate form to route to. mode just swaps that
              screen's headline copy so "Sign in" doesn't land on
              new-account-creation framing. */}
          <Pressable
            style={styles.signInButton}
            onPress={() => router.push({ pathname: '/login', params: { mode: 'signin' } })}
            hitSlop={8}
          >
            <Text style={styles.signInText}>Sign in</Text>
          </Pressable>
          <Pressable
            style={styles.signUpButton}
            onPress={() => router.push({ pathname: '/login', params: { mode: 'signup' } })}
          >
            <Text style={styles.signUpText}>Sign up</Text>
          </Pressable>
        </View>
      ) : (
        // Same white-fill/1.5px-INK-border tertiary circle convention as
        // settings.tsx's closeButton/recipe.tsx's closeButton -- routes
        // straight into the existing Profile tab (group segments like
        // "(tabs)" don't appear in the URL, so this is just '/profile',
        // same pattern stores.tsx already uses for '/meals').
        <Pressable style={styles.profileButton} onPress={() => router.push('/profile')} hitSlop={8}>
          <PersonIcon size={18} color={INK} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    // Trimmed from 12 (Anabelle's call: bar shouldn't be taller than the
    // Sign up button itself) -- paddingTop:60 above is still the fixed
    // status-bar clearance, untouched; this is just the visible strip's
    // own bottom breathing room, now snug around the row's tallest child
    // (the Sign up button, ~34px) instead of padding well past it.
    paddingBottom: 8,
    // White (Anabelle's call) -- was the shared peach ('#FFEAD4'), now a
    // plain white strip that sits above the peach page background.
    backgroundColor: '#fff',
  },
  authButtons: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  signInButton: { paddingVertical: 6, paddingHorizontal: 4 },
  signInText: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  signUpButton: {
    backgroundColor: ACCENT,
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  signUpText: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  profileButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
