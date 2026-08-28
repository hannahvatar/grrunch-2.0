import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRightIcon, LockClosedIcon } from 'react-native-heroicons/outline';

const INK = '#111';

// Inline teaser shown beside a locked, paid-tier feature -- always routes
// to the shared /upgrade modal (app/upgrade.tsx), which is where the real
// "start trial" action happens (creates an account first if needed), so
// every locked-feature entry point shows the same explainer + price
// before committing, rather than each one having its own logic.
//
// variant 'solid' (default) is the original black-fill treatment, used by
// Profile's Membership section (the page's one real top-level "you're not
// a member" banner). variant 'outline' is the next-to-feature white/dashed
// treatment (Anabelle's call) used for Saved recipes/Companion recipes --
// same content and route, just a lighter-weight look for a locked
// secondary section rather than the page's primary conversion moment.
export function UpgradeCta({ reason, variant = 'solid' }: { reason: string; variant?: 'solid' | 'outline' }) {
  const outline = variant === 'outline';
  return (
    <Pressable
      style={[styles.container, outline && styles.containerOutline]}
      onPress={() => router.push({ pathname: '/upgrade', params: { reason } })}
    >
      <LockClosedIcon size={18} color={outline ? INK : '#fff'} />
      <View style={styles.textBlock}>
        <Text style={[styles.title, outline && styles.titleOutline]}>Start 30-day free trial</Text>
        <Text style={[styles.subtitle, outline && styles.subtitleOutline]}>Then $5.99/mo · Cancel anytime</Text>
      </View>
      <ChevronRightIcon size={18} color={outline ? INK : '#999'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#111',
    borderRadius: 14,
    padding: 14,
  },
  containerOutline: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: INK,
  },
  textBlock: { flex: 1 },
  title: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  titleOutline: { color: INK },
  subtitle: { color: '#ccc', fontSize: 12, marginTop: 2 },
  subtitleOutline: { color: '#666' },
});
