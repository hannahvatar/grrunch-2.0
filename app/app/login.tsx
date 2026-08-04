import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import * as Network from 'expo-network';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Alert, ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { EnvelopeIcon, XMarkIcon } from 'react-native-heroicons/outline';

import { supabase } from '../lib/supabase';

// makeRedirectUri() is meant to auto-detect web vs. native, but in
// practice returned the native grrunch:// scheme even when called from
// the web build -- so this checks Platform.OS directly instead of
// trusting that detection, which matters a lot here: a native-scheme
// redirect is meaningless to a browser (or an email client's "open link"
// action opening one), so getting this wrong makes the confirmation link
// silently fail rather than error clearly.
function getRedirectUri(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }
  return makeRedirectUri();
}

// Guest-mode wireframe step 2 — Sign up / Log in.
// Apple, Google, and email are all wired to real Supabase auth now. Apple
// uses the real native "Sign in with Apple" system sheet (Face ID / account
// picker) via expo-apple-authentication -- that sheet is Apple's own UI, not
// something to rebuild in React Native. Google uses Supabase's OAuth
// redirect flow via expo-web-browser. Email uses Supabase's own confirmation
// link (not a one-time code) -- the project's free tier locks email
// template editing behind custom SMTP, which isn't set up, so the code
// variable ({{ .Token }}) never actually appears in the email that gets
// sent. The link approach needs no template changes: it's completed via
// detectSessionInUrl on web (see lib/supabase.ts) and the deep-link
// listener below on native. Same request both creates the account and
// signs in, so there's no separate "log in" form to build.
//
// Apple, Google, and email all need one thing from the Supabase dashboard
// before they'll fully work end to end, none of which can be done from
// here: Apple needs a Services ID/Team ID/key from an Apple Developer
// account (Auth > Providers > Apple); Google needs an OAuth client
// ID/secret from Google Cloud Console (Auth > Providers > Google); email's
// redirect target (see makeRedirectUri() below) needs to be added to
// Auth > URL Configuration > Redirect URLs, or Supabase will reject the
// confirmation link as an untrusted redirect.
WebBrowser.maybeCompleteAuthSession();

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
  // shows the same banner.
  const [cancelledMessage, setCancelledMessage] = useState<string | null>(null);

  // emailSent switches the form from "enter your email" to "check your
  // email" -- sign-in itself completes later, out of band, when the
  // confirmation link is tapped (see the deep-link listener below and
  // lib/supabase.ts's detectSessionInUrl for the web case).
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAuthAvailable)
      .catch(() => setAppleAuthAvailable(false));
  }, []);

  // Native equivalent of lib/supabase.ts's detectSessionInUrl (which only
  // handles web, since it reads window.location) -- the confirmation link
  // opens the app via its grrunch:// scheme with the session tokens in the
  // URL, which the Supabase JS SDK never sees on its own there.
  useEffect(() => {
    const subscription = Linking.addEventListener('url', async ({ url }) => {
      const parsed = Linking.parse(url);
      const fragment = url.split('#')[1];
      const fromFragment = fragment ? new URLSearchParams(fragment) : null;
      const accessToken =
        (parsed.queryParams?.access_token as string | undefined) ?? fromFragment?.get('access_token');
      const refreshToken =
        (parsed.queryParams?.refresh_token as string | undefined) ?? fromFragment?.get('refresh_token');
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      }
    });
    return () => subscription.remove();
  }, []);

  async function handleAppleSignIn() {
    setCancelledMessage(null);
    if (await isOffline()) {
      router.push('/offline');
      return;
    }
    try {
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (!credential.identityToken) {
        throw new Error('Apple did not return an identity token.');
      }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      });
      if (error) {
        router.push({
          pathname: '/error',
          params: {
            body: `Apple sign-in failed: ${error.message}`,
            footnote: "Apple verified your identity -- this usually means Sign in with Apple isn't configured yet in Supabase.",
          },
        });
        return;
      }
      router.push('/location');
    } catch (error) {
      if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') {
        setCancelledMessage('Sign-in was cancelled.');
      } else {
        router.push({
          pathname: '/error',
          params: {
            body: 'Something went wrong while signing you in. Please try again.',
            footnote: 'Apple verified your identity. The issue is on our end.',
          },
        });
      }
    }
  }

  async function handleGoogleSignIn() {
    setCancelledMessage(null);
    if (await isOffline()) {
      router.push('/offline');
      return;
    }
    const redirectTo = getRedirectUri();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) {
      router.push({
        pathname: '/error',
        params: {
          body: `Google sign-in failed: ${error?.message ?? 'no auth URL returned'}`,
          footnote: "This usually means Google isn't configured yet as a Supabase auth provider.",
        },
      });
      return;
    }
    // The system browser/popup can be blocked by the platform (mobile
    // browsers in particular) rather than the user actually cancelling --
    // that's a real, expected outcome here, not a bug, so it gets the same
    // graceful error handling as an actual auth failure.
    let result: WebBrowser.WebBrowserAuthSessionResult;
    try {
      result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    } catch (openError) {
      router.push({
        pathname: '/error',
        params: {
          body: `Couldn't open Google sign-in: ${(openError as Error).message}`,
          footnote: 'This can happen when the browser blocks the sign-in popup.',
        },
      });
      return;
    }
    if (result.type === 'success' && result.url) {
      const returned = new URL(result.url);
      const params = new URLSearchParams(returned.hash ? returned.hash.slice(1) : returned.search);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        router.push('/location');
        return;
      }
      router.push({
        pathname: '/error',
        params: { body: "Google sign-in didn't return a usable session. Please try again." },
      });
      return;
    }
    if (result.type === 'cancel' || result.type === 'dismiss') {
      setCancelledMessage('Sign-in was cancelled.');
    }
  }

  async function handleEmailContinue() {
    if (!email.trim()) return;
    setEmailError(null);
    setEmailLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: getRedirectUri() },
    });
    setEmailLoading(false);
    if (error) {
      setEmailError(error.message);
      return;
    }
    setEmailSent(true);
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
          <XMarkIcon size={16} color="#888" />
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
      <Pressable style={styles.oauthButton} onPress={handleGoogleSignIn}>
        <Text style={styles.oauthText}>G  Continue with Google</Text>
      </Pressable>

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      {emailError && (
        <View style={styles.statusBanner}>
          <XMarkIcon size={16} color="#888" />
          <Text style={styles.statusBannerText}>{emailError}</Text>
        </View>
      )}

      {emailSent ? (
        <View style={styles.statusBanner}>
          <EnvelopeIcon size={16} color="#888" />
          <View style={styles.emailSentTextBlock}>
            <Text style={styles.statusBannerText}>
              We sent a confirmation link to {email}. Open it to finish signing in.
            </Text>
            <Pressable onPress={() => setEmailSent(false)}>
              <Text style={styles.loginPrompt}>Use a different email</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#999"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
          <Pressable
            style={[styles.primaryButton, emailLoading && styles.primaryButtonDisabled]}
            onPress={handleEmailContinue}
            disabled={emailLoading}
          >
            {emailLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Continue</Text>
            )}
          </Pressable>
        </>
      )}

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
  title: { fontSize: 26, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
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
  statusBannerText: { fontSize: 14, color: '#555' },
  oauthButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  oauthText: { fontSize: 16, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold' },
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
  primaryButtonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  emailSentTextBlock: { flex: 1, gap: 6 },
  loginPrompt: { color: '#666', textDecorationLine: 'underline' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 12 },
  guestButton: { alignItems: 'center', gap: 4 },
  guestText: { fontSize: 16, color: '#333' },
  guestSubtext: { fontSize: 13, color: '#999' },
});
