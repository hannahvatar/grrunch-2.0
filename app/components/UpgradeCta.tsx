import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRightIcon, LockClosedIcon } from 'react-native-heroicons/outline';

// Inline teaser shown beside a locked, paid-tier feature -- always routes
// to the shared /upgrade modal (app/upgrade.tsx), which is where the real
// "start trial" action happens (creates an account first if needed), so
// every locked-feature entry point shows the same explainer + price
// before committing, rather than each one having its own logic.
export function UpgradeCta({ reason }: { reason: string }) {
  return (
    <Pressable
      style={styles.container}
      onPress={() => router.push({ pathname: '/upgrade', params: { reason } })}
    >
      <LockClosedIcon size={18} color="#fff" />
      <View style={styles.textBlock}>
        <Text style={styles.title}>Start 30-day free trial</Text>
        <Text style={styles.subtitle}>Then $5.99/mo · Cancel anytime</Text>
      </View>
      <ChevronRightIcon size={18} color="#999" />
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
  textBlock: { flex: 1 },
  title: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  subtitle: { color: '#ccc', fontSize: 12, marginTop: 2 },
});
