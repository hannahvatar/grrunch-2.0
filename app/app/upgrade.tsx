import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { LockOpenIcon, XMarkIcon } from 'react-native-heroicons/outline';

import { useAuth } from '../lib/auth';
import { usePurchases } from '../lib/purchases';
import { useSubscription } from '../lib/subscription';

// GRRUNCH DS -- matches recipe.tsx's own bottom-sheet convention (peach
// fill, not the onboarding screens' white-to-peach gradient).
const ACCENT = '#FFA955';
const INK = '#111';

// Shared upgrade prompt — presented as a modal wherever a locked, paid-tier
// feature is tapped (see components/UpgradeCta.tsx, and the direct call
// from stores.tsx for store customization). Takes an optional `reason`
// param so the body copy can name the specific feature that's gated,
// falling back to generic copy if none is given.
//
// UI pass (2026-09-08, Anabelle: "I thought the modal UI was done") --
// the 2026-08-28 commit that touched this file was copy-only ("dropped
// Grrunch Plus branding"); the visuals underneath were never brought in
// line with the rest of the app's DS (flat white bg, grey icon circle,
// plain black button instead of the peach/INK-border/ACCENT-pill
// language everywhere else). This pass fixes that, using recipe.tsx's
// own bottom-sheet styling as the reference since it's the same modal
// shape (handle + close X + centered content + footer button).
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
        <XMarkIcon size={18} color={INK} />
      </Pressable>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <LockOpenIcon size={32} color={INK} strokeWidth={1.5} />
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
        {!isSubscribed && (
          <View style={styles.actions}>
            <Pressable style={styles.primaryButton} onPress={handlePrimaryAction} disabled={loading}>
              {loading ? (
                <ActivityIndicator color={INK} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFEAD4' },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginTop: 8,
  },
  // White-fill/1.5px-INK-border tertiary circle -- same convention as
  // recipe.tsx's own closeButton, settings.tsx's closeButton, etc.
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  // White fill, no border (Anabelle's call) -- softer than the app's
  // usual "modal treatment" (white + 2px INK border), fitting since
  // this is the "here's how to unlock it" moment, not a locked/denied
  // one (the closed-lock + bordered-circle treatment is still used at
  // the point something is actually gated -- MealCard's
  // groceryToggleButtonLocked, profile.tsx's changeStoreButton, etc.).
  // LockOpenIcon here for the same reason, instead of LockClosedIcon.
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'OpenSans_800ExtraBold',
    marginBottom: 12,
    textAlign: 'center',
    color: INK,
  },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', color: INK },
  priceNote: {
    fontSize: 13,
    color: INK,
    fontWeight: '700',
    fontFamily: 'OpenSans_700Bold',
    marginTop: 12,
  },
  // Matches InputField.tsx's own ERROR const exactly, so an error here
  // reads as the same "error red" as everywhere else in the app.
  errorText: { fontSize: 13, color: '#D0342C', marginTop: 12, textAlign: 'center' },
  // Sits right in the centered content block, directly under priceNote
  // (Anabelle's call) -- was a separate footer View pinned to the
  // screen's own bottom edge, leaving a big gap between the pricing
  // line and the button. width:'100%' since content's alignItems:
  // 'center' would otherwise shrink this to its own content size.
  actions: { width: '100%', marginTop: 24, gap: 12, alignItems: 'center' },
  // Real btn-primary-orange -- see the DS's canonical spec on login.tsx's
  // primaryButton (ACCENT fill, 2px INK border, 28px pill, 56pt tall).
  // Was a flat black/14px-radius button, matching nothing else in the app.
  primaryButton: {
    alignSelf: 'stretch',
    height: 56,
    justifyContent: 'center',
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 28,
    alignItems: 'center',
  },
  primaryButtonText: { color: INK, fontSize: 17, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  restoreText: { fontSize: 13, color: '#767676', textDecorationLine: 'underline' },
});
