import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRightIcon, UserIcon } from 'react-native-heroicons/outline';

import { UpgradeCta } from './UpgradeCta';

const INK = '#111';

// Guest-state prompt for a member-only screen that's ALSO gated on having
// an account at all (Manage account, Payment) -- two real, distinct paths
// forward, not one CTA standing in for both: "Sign in" (an existing
// account, real supabase.auth session, no payment involved) and "Start
// your 30-day free trial" (the existing UpgradeCta outline variant,
// unchanged). signInCard deliberately mirrors UpgradeCta's outline
// container/icon/text styling exactly (Anabelle's call, 2026-08-28) --
// same padding/radius/gap/font sizes, solid border instead of dashed --
// so the two cards read as one consistent pair, not two different styles.
export function SignInOrTrialPrompt({ reason }: { reason: string }) {
  return (
    <View style={styles.wrap}>
      <Pressable style={styles.signInCard} onPress={() => router.push('/login')}>
        <UserIcon size={18} color={INK} />
        <View style={styles.textBlock}>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>Already have an account? Pick up where you left off</Text>
        </View>
        <ChevronRightIcon size={18} color={INK} />
      </Pressable>

      <View style={styles.orRow}>
        <View style={styles.orLine} />
        <Text style={styles.orText}>OR</Text>
        <View style={styles.orLine} />
      </View>

      <UpgradeCta reason={reason} variant="outline" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  // Matches UpgradeCta's containerOutline + container base styles exactly
  // -- only borderStyle differs (solid here, dashed there).
  signInCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: INK,
  },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orLine: { flex: 1, height: 1, backgroundColor: INK },
  orText: { fontSize: 12, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK, letterSpacing: 1 },
  // Matches UpgradeCta's titleOutline/subtitleOutline exactly.
  textBlock: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  subtitle: { fontSize: 12, color: '#666', marginTop: 2 },
});
