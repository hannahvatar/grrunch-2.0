import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { LockClosedIcon, XMarkIcon } from 'react-native-heroicons/outline';

import { useAuth } from '../lib/auth';
import { usePurchases } from '../lib/purchases';
import { useSubscription } from '../lib/subscription';

// Shared upgrade prompt — presented as a modal wherever a locked, paid-tier
// feature is tapped (see components/UpgradeCta.tsx, and the direct call
// from stores.tsx for store customization). Takes an optional `reason`
// param so the body copy can name the specific feature that's gated,
// falling back to generic copy if none is given.
//
// Two real purchase paths coexist for now:
// - usePurchases().configured: RevenueCat is set up with real Apple/Google
//   API keys (see lib/purchases.tsx) -- tapping the button starts a real
//   in-app purchase (App Store/Play billing handles the free-trial period
//   itself, configured on the product in each store's dashboard).
// - Not yet configured (no RevenueCat keys set, or running on web where
//   in-app purchases don't exist at all): falls back to the original
//   useSubscription().startTrial() path, a DB-only 30-day trial with no
//   real payment behind it -- this is what every existing screen still
//   expects while the store products/RevenueCat dashboard aren't live yet.
export default function UpgradeScreen() {
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const { isGuest } = useAuth();
  const { isSubscribed: dbSubscribed, startTrial } = useSubscription();
  const { configured, offering, isSubscribed: purchasesSubscribed, purchase, restore } = usePurchases();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSubscribed = configured ? purchasesSubscribed : dbSubscribed;
  const pkg = offering?.availablePackages[0];

  async function handlePrimaryAction() {
    if (isGuest) {
      router.replace('/login');
      return;
    }
    setError(null);
    setLoading(true);
    const { error: actionError } =
      configured && pkg ? await purchase(pkg) : await startTrial();
    setLoading(false);
    if (actionError) {
      setError(actionError);
      return;
    }
    router.back();
  }

  async function handleRestore() {
    setError(null);
    setLoading(true);
    const { error: restoreError } = await restore();
    setLoading(false);
    if (restoreError) {
      setError(restoreError);
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
        <Text style={styles.title}>Start 30-day free trial</Text>
        <Text style={styles.body}>
          {isSubscribed
            ? "You're already on a Grrunch trial or membership."
            : reason
              ? `Try Grrunch free for 30 days to ${reason}, plus all your meal recommendations, unlimited saved recipes, and full deals in every category.`
              : 'Try Grrunch free for 30 days for all your meal recommendations, unlimited saved recipes, and full deals in every category.'}
        </Text>
        <Text style={styles.priceNote}>
          {configured && pkg ? `${pkg.product.priceString}/mo · Cancel anytime` : 'Then $5.99/mo · Cancel anytime'}
        </Text>
        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>
      {!isSubscribed && (
        <View style={styles.footer}>
          <Pressable style={styles.primaryButton} onPress={handlePrimaryAction} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {isGuest ? 'Start free trial' : 'Start 30-day free trial'}
              </Text>
            )}
          </Pressable>
          {configured && !isGuest && (
            <Pressable onPress={handleRestore} disabled={loading} hitSlop={8}>
              <Text style={styles.restoreText}>Restore purchases</Text>
            </Pressable>
          )}
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
  footer: { padding: 24, gap: 12, alignItems: 'center' },
  primaryButton: {
    alignSelf: 'stretch',
    backgroundColor: '#111',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  restoreText: { fontSize: 13, color: '#666', textDecorationLine: 'underline' },
});
