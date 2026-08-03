import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
      <Text style={styles.icon}>🔒</Text>
      <View style={styles.textBlock}>
        <Text style={styles.title}>Start 30-day free trial</Text>
        <Text style={styles.subtitle}>Then $5.99/mo · Cancel anytime</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
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
  icon: { fontSize: 18 },
  textBlock: { flex: 1 },
  title: { color: '#fff', fontSize: 14, fontWeight: '700' },
  subtitle: { color: '#ccc', fontSize: 12, marginTop: 2 },
  chevron: { color: '#999', fontSize: 18 },
});
