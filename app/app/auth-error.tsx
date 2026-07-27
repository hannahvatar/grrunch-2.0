import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

// Wireframe A3 — Apple auth error. Full-screen state for a genuine sign-in
// failure (not a cancellation, which stays a banner on the Login screen
// itself). Presented as a modal, matching upgrade.tsx/recipe.tsx.
export default function AuthErrorScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.handle} />
      <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={8}>
        <Text style={styles.backButtonText}>‹</Text>
      </Pressable>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Text style={styles.icon}>!</Text>
        </View>
        <Text style={styles.title}>Sign-in couldn't complete</Text>
        <Text style={styles.body}>We couldn't sign you in. Please try again.</Text>
      </View>
      <View style={styles.footer}>
        <Pressable style={styles.primaryButton} onPress={() => router.back()}>
          <Text style={styles.primaryButtonText}>Try again</Text>
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
  backButton: { position: 'absolute', top: 24, left: 20 },
  backButtonText: { fontSize: 28, color: '#111' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  icon: { fontSize: 24, color: '#999' },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  body: { fontSize: 15, color: '#666', textAlign: 'center' },
  footer: { padding: 24 },
  primaryButton: {
    backgroundColor: '#111',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
