import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { UserPlusIcon, XMarkIcon } from 'react-native-heroicons/outline';

// GRRUNCH DS -- matches upgrade.tsx's own bottom-sheet convention.
const ACCENT = '#FFA955';
const INK = '#111';

// Soft, skippable sign-up nudge -- shown at most once, triggered from
// recipe.tsx after a guest has viewed a few recipes (see
// lib/guestNudge.ts). Same modal shape as upgrade.tsx (handle, close X,
// icon circle, title, body, one primary button) but a genuinely different
// ask: creating an account is free and unrelated to membership -- no
// price note, no trial language, nothing paywall-shaped here. Restyled
// alongside upgrade.tsx (2026-09-08 UI pass) to keep that "same shape"
// parity real, not just structural.
export default function SignupNudgeScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.handle} />
      <Pressable style={styles.closeButton} onPress={() => router.back()}>
        <XMarkIcon size={18} color={INK} />
      </Pressable>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <UserPlusIcon size={30} color={INK} />
        </View>
        <Text style={styles.title}>Create a free account</Text>
        <Text style={styles.body}>
          Save your favorite recipes and pick up where you left off next time — free, no payment needed. You
          can always add membership later.
        </Text>
      </View>
      <View style={styles.footer}>
        <Pressable style={styles.primaryButton} onPress={() => router.replace('/login')}>
          <Text style={styles.primaryButtonText}>Create free account</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.laterText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFEAD4' },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginTop: 8,
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'OpenSans_800ExtraBold',
    marginBottom: 12,
    textAlign: 'center',
    color: INK,
  },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', color: '#343837' },
  footer: { padding: 24, gap: 12, alignItems: 'center' },
  primaryButton: {
    alignSelf: 'stretch',
    height: 56,
    justifyContent: 'center',
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 28,
    alignItems: 'center',
  },
  primaryButtonText: { color: INK, fontSize: 17, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  laterText: { fontSize: 13, color: '#767676', textDecorationLine: 'underline' },
});
