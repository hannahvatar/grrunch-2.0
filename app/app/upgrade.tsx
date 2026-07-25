import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

// Shared upgrade prompt — presented as a modal wherever a locked, paid-tier
// feature is tapped (currently: customizing stores near you). Takes an
// optional `reason` param so the body copy can name the specific feature
// that's gated, falling back to generic copy if none is given.
export default function UpgradeScreen() {
  const { reason } = useLocalSearchParams<{ reason?: string }>();

  return (
    <View style={styles.container}>
      <View style={styles.handle} />
      <Pressable style={styles.closeButton} onPress={() => router.back()}>
        <Text style={styles.closeButtonText}>✕</Text>
      </Pressable>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Text style={styles.icon}>🔒</Text>
        </View>
        <Text style={styles.title}>Upgrade to Grrunch Plus</Text>
        <Text style={styles.body}>
          {reason
            ? `Try Grrunch Plus free for 30 days to ${reason}, plus 10 meals per plan, unlimited swaps, and unlimited saved recipes.`
            : 'Try Grrunch Plus free for 30 days for full store customization, 10 meals per plan, unlimited swaps, and unlimited saved recipes.'}
        </Text>
      </View>
      <View style={styles.footer}>
        <Pressable style={styles.primaryButton} onPress={() => router.back()}>
          <Text style={styles.primaryButtonText}>Start free trial</Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.upgradeLink}>Upgrade</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginTop: 8,
  },
  closeButton: { position: 'absolute', top: 20, right: 20 },
  closeButtonText: { fontSize: 20, color: '#999' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  icon: { fontSize: 30 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', color: '#666' },
  footer: { padding: 24, gap: 4 },
  primaryButton: {
    backgroundColor: '#111',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  upgradeLink: { textAlign: 'center', fontSize: 15, fontWeight: '600', color: '#2C5FD6', marginTop: 12 },
});
