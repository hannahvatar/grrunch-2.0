import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

// Guest-mode wireframe step 3 — Location permission.
// All three options lead to the same next screen for now (Stores) — manual
// store search and a distinct "skipped" store-selection state aren't built
// yet, just the auto-detected path from the nearest-stores Edge Function.
export default function LocationScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.spacer} />
      <View style={styles.iconCircle}>
        <Text style={styles.icon}>📍</Text>
      </View>
      <Text style={styles.title}>Find deals near you</Text>
      <Text style={styles.body}>
        Grrunch can use your location to show nearby stores. This is optional — you can always
        search manually instead.
      </Text>
      <View style={styles.spacer} />
      <Pressable style={styles.primaryButton} onPress={() => router.push('/stores')}>
        <Text style={styles.primaryButtonText}>Allow location access</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={() => router.push('/stores')}>
        <Text style={styles.secondaryButtonText}>Choose store manually</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/stores')}>
        <Text style={styles.skipText}>Skip for now</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  spacer: { height: 24 },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  icon: { fontSize: 36 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', color: '#666' },
  primaryButton: {
    width: '100%',
    backgroundColor: '#111',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  secondaryButton: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryButtonText: { fontSize: 16, fontWeight: '600' },
  skipText: { color: '#999', fontSize: 15 },
});
