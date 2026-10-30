import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { UpgradeCta } from './UpgradeCta';

const ACCENT = '#FFA955';
const INK = '#111';

// Guest-state prompt for a member-only screen that's ALSO gated on having
// an account at all (Manage account, Notifications) -- two real, distinct
// paths forward: "Sign in" (an existing account, no payment involved) and
// the trial card (UpgradeCta, like every other trial card). The sign-in
// path is a plain row, black "Already have an account?" with an orange
// Sign in button on its right, in a white container (Anabelle,
// 2026-10-30; was a white card with title, subtitle and chevron).
export function SignInOrTrialPrompt({ reason }: { reason: string }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.signInRow}>
        <Text style={styles.signInText}>Already have an account?</Text>
        <Pressable
          style={styles.signInButton}
          onPress={() => router.push({ pathname: '/login', params: { mode: 'signin' } })}
        >
          <Text style={styles.signInButtonText}>Sign in</Text>
        </Pressable>
      </View>

      <View style={styles.orRow}>
        <View style={styles.orLine} />
        <Text style={styles.orText}>OR</Text>
        <View style={styles.orLine} />
      </View>

      <UpgradeCta reason={reason} variant="tile" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  signInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: INK,
  },
  signInText: { flexShrink: 1, fontSize: 16, color: INK },
  // Same btn-primary-orange as UpgradeCta's ctaButton (ACCENT fill, 2px INK
  // border, 24px radius), sized to its label.
  signInButton: {
    height: 44,
    paddingHorizontal: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 24,
  },
  signInButtonText: { color: INK, fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orLine: { flex: 1, height: 1, backgroundColor: INK },
  orText: { fontSize: 12, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK, letterSpacing: 1 },
});
