import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

// Guest-mode wireframe step 2 — Sign up / Log in.
// Only "Continue as guest" is wired to the guest-mode flow for now — Apple/
// Google/email auth and the "Log in" link belong to the account-holder flow,
// not yet built.
export default function LoginScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Save deals & build your lists</Text>
      <Text style={styles.subtitle}>Create a free account to get started.</Text>

      <Pressable style={styles.oauthButton}>
        <Text style={styles.oauthText}>🍎  Continue with Apple</Text>
      </Pressable>
      <Pressable style={styles.oauthButton}>
        <Text style={styles.oauthText}>G  Continue with Google</Text>
      </Pressable>

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      <TextInput style={styles.input} placeholder="you@example.com" placeholderTextColor="#999" />
      <Pressable style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>Continue</Text>
      </Pressable>

      <Text style={styles.loginPrompt}>
        Already have an account? <Text style={styles.loginLink}>Log in</Text>
      </Text>

      <View style={styles.divider} />

      <Pressable style={styles.guestButton} onPress={() => router.push('/location')}>
        <Text style={styles.guestText}>Continue as guest</Text>
        <Text style={styles.guestSubtext}>Deals browsing only · no saved lists</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, gap: 12 },
  title: { fontSize: 26, fontWeight: '800' },
  subtitle: { fontSize: 15, color: '#666', marginBottom: 12 },
  oauthButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  oauthText: { fontSize: 16, fontWeight: '600' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 8, gap: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#eee' },
  dividerText: { color: '#999', fontSize: 13 },
  input: {
    backgroundColor: '#F2F2F2',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  primaryButton: {
    backgroundColor: '#111',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  loginPrompt: { textAlign: 'center', color: '#666', marginTop: 4 },
  loginLink: { fontWeight: '700', color: '#111' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 12 },
  guestButton: { alignItems: 'center', gap: 4 },
  guestText: { fontSize: 16, color: '#333' },
  guestSubtext: { fontSize: 13, color: '#999' },
});
