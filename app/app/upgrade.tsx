import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { LockClosedIcon, XMarkIcon } from 'react-native-heroicons/outline';

import { useAuth } from '../lib/auth';
import { useSubscription } from '../lib/subscription';

// Shared upgrade prompt — presented as a modal wherever a locked, paid-tier
// feature is tapped (see components/UpgradeCta.tsx, and the direct call
// from stores.tsx for store customization). Takes an optional `reason`
// param so the body copy can name the specific feature that's gated,
// falling back to generic copy if none is given.
//
// "Start free trial" is the one real action here: a guest has no account
// to attach a subscription to, so it sends them to sign up first; a
// signed-in user gets a real trial row via useSubscription().startTrial().
// No payment processor is wired up yet, so this only ever starts a free
// trial -- there's no path to real recurring billing until Stripe (or
// similar) is integrated.
export default function UpgradeScreen() {
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const { isGuest } = useAuth();
  const { isSubscribed, startTrial } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStartTrial() {
    if (isGuest) {
      router.replace('/login');
      return;
    }
    setError(null);
    setLoading(true);
    const { error: startError } = await startTrial();
    setLoading(false);
    if (startError) {
      setError(startError);
      return;
    }
    router.back();
  }

  return (
    <View style={styles.container}>
      <View style={styles.handle} />
      <Pressable style={styles.closeButton} onPress={() => router.back()}>
        <XMarkIcon size={20} color="#999" />
      </Pressable>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <LockClosedIcon size={30} color="#111" />
        </View>
        <Text style={styles.title}>Upgrade to Grrunch Plus</Text>
        <Text style={styles.body}>
          {isSubscribed
            ? "You're already on a Grrunch Plus trial or membership."
            : reason
              ? `Try Grrunch Plus free for 30 days to ${reason}, plus all your meal recommendations, unlimited saved recipes, and full deals in every category.`
              : 'Try Grrunch Plus free for 30 days for all your meal recommendations, unlimited saved recipes, and full deals in every category.'}
        </Text>
        <Text style={styles.priceNote}>Then $5.99/mo · Cancel anytime</Text>
        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>
      {!isSubscribed && (
        <View style={styles.footer}>
          <Pressable style={styles.primaryButton} onPress={handleStartTrial} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {isGuest ? 'Create an account' : 'Start free trial'}
              </Text>
            )}
          </Pressable>
        </View>
      )}
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
  title: { fontSize: 22, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', marginBottom: 12, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', color: '#666' },
  priceNote: { fontSize: 13, color: '#999', marginTop: 12 },
  errorText: { fontSize: 13, color: '#c0392b', marginTop: 12, textAlign: 'center' },
  footer: { padding: 24, gap: 4 },
  primaryButton: {
    backgroundColor: '#111',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
});
