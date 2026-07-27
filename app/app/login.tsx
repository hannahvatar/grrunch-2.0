import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import * as Network from 'expo-network';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

// Guest-mode wireframe step 2 — Sign up / Log in.
// Only "Continue as guest" and Apple are wired up so far. Apple uses the
// real native "Sign in with Apple" system sheet (Face ID / account picker)
// via expo-apple-authentication -- that sheet is Apple's own UI, not
// something to rebuild in React Native. Google/email auth and the "Log in"
// link still belong to the account-holder flow, not yet built.

// Real connectivity check (expo-network works in Expo Go, unlike
// expo-apple-authentication) -- checked before attempting sign-in so the
// offline screen reflects an actual condition, not another demo trigger.
// isInternetReachable can be null/undefined ("unknown") on some platforms;
// only treat it as offline when we get an explicit false, so an
// inconclusive check never blocks a sign-in attempt that might work.
async function isOffline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.isConnected === false || state.isInternetReachable === false;
  } catch {
    return false;
  }
}

export default function LoginScreen() {
  const [appleAuthAvailable, setAppleAuthAvailable] = useState(false);
  // Shared across Apple/Google/email -- whichever method gets cancelled
  // shows the same banner. Only Apple actually wires into it so far; Google
  // and email aren't implemented yet, so they have nothing to cancel.
  const [cancelledMessage, setCancelledMessage] = useState<string | null>(null);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAuthAvailable)
      .catch(() => setAppleAuthAvailable(false));
  }, []);

  async function handleAppleSignIn() {
    setCancelledMessage(null);
    if (await isOffline()) {
      router.push('/offline');
      return;
    }
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      // TODO: exchange credential.identityToken with Supabase
      // (supabase.auth.signInWithIdToken({ provider: 'apple', token: ... }))
      // once Apple Sign In is configured as an auth provider in the
      // Supabase dashboard -- that needs an Apple Developer Services ID
      // and key, which hasn't been set up yet.
      void credential;
      router.push('/location');
    } catch (error) {
      if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') {
        setCancelledMessage('Sign-in was cancelled.');
      } else {
        router.push('/auth-error');
      }
    }
  }

  // Expo Go (and web) can't run the real native module, so there's no real
  // confirmation sheet or cancel event to hook into -- this simulates that
  // same shape (a confirmation step with a Cancel option) using Alert,
  // which is real native UI and works fine on Expo Go (unlike on web, where
  // Alert.alert is a no-op). The banner fires specifically on "Cancel",
  // matching how the real flow behaves, not on the initial button tap.
  // Swap for the real thing once expo-apple-authentication actually works
  // (i.e. once this whole function stops being reachable on iOS).
  async function handleAppleSignInFallback() {
    setCancelledMessage(null);
    if (await isOffline()) {
      router.push('/offline');
      return;
    }
    Alert.alert('Sign in with Grrunch', 'Using your Apple Account', [
      { text: 'Cancel', style: 'cancel', onPress: () => setCancelledMessage('Sign-in was cancelled.') },
      { text: 'Continue', onPress: () => router.push('/location') },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Save deals & build your lists</Text>
      <Text style={styles.subtitle}>Create a free account to get started.</Text>

      {cancelledMessage && (
        <View style={styles.statusBanner}>
          <Text style={styles.statusBannerIcon}>✕</Text>
          <Text style={styles.statusBannerText}>{cancelledMessage}</Text>
        </View>
      )}

      {appleAuthAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={14}
          style={styles.appleButton}
          onPress={handleAppleSignIn}
        />
      ) : (
        <Pressable style={styles.oauthButton} onPress={handleAppleSignInFallback}>
          <Text style={styles.oauthText}>🍎  Continue with Apple</Text>
        </Pressable>
      )}
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
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F2F2F2',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  statusBannerIcon: { fontSize: 14, color: '#888' },
  statusBannerText: { fontSize: 14, color: '#555' },
  oauthButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  oauthText: { fontSize: 16, fontWeight: '600' },
  appleButton: { width: '100%', height: 54 },
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
