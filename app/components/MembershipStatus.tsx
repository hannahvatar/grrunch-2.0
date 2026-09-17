import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LockClosedIcon, TrophyIcon } from 'react-native-heroicons/outline';

import {
  ANNUAL_MONTHLY_EQUIVALENT_DISPLAY,
  ANNUAL_PRICE_DISPLAY,
  MONTHLY_PRICE_DISPLAY,
  usePurchases,
} from '../lib/purchases';
import {
  getTrialDaysLeft,
  getTrialUrgencyTier,
  TRIAL_DAYS,
  TRIAL_ENDED_MESSAGE,
  TRIAL_URGENCY_STYLES,
  useSubscription,
} from '../lib/subscription';
import { UpgradeCta } from './UpgradeCta';

const ACCENT = '#FFA955';
const INK = '#111';
// Matches ManageAccountSection.tsx's own ERROR const -- same red used for
// "Delete account" there, now this card's "Cancel trial".
const ERROR = '#D0342C';

// Apple/Google don't let a third-party app cancel or toggle auto-renew
// on a real store subscription directly -- only their own native
// subscription-management screens can (same reason the FAQ's "How do I
// cancel my trial or membership?" answer, app/lib/support.ts, routes
// there once purchases go live). "Cancel membership" below deep-links
// out to it instead of pretending to process a cancellation in-app.
const MANAGE_SUBSCRIPTION_URL = Platform.select({
  ios: 'https://apps.apple.com/account/subscriptions',
  android: 'https://play.google.com/store/account/subscriptions',
  default: 'https://apps.apple.com/account/subscriptions',
});

function formatRenewalDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Real subscription status card -- extracted from profile.tsx's
// Membership section (Anabelle, 2026-08-28) so payment.tsx can show the
// exact same real status instead of duplicating the isSubscribed/
// trialing/expired/none branching a second time. Assumes the caller has
// already checked isGuest (see lib/auth.tsx) -- this component only
// handles the four subscription states, not the signed-out state, since
// what a guest should see differs by context (Manage account vs Payment).
export function MembershipStatus() {
  const { status: subscriptionStatus, trialEndsAt, isSubscribed, cancelTrial } = useSubscription();
  const { activePackage, expirationDate, willRenew } = usePurchases();
  const [cancelling, setCancelling] = useState(false);

  // The real price/period the member is actually on, now that there are
  // two (Anabelle, 2026-09-15) -- falls back to a plan-agnostic line
  // rather than guessing when activePackage isn't known yet (RevenueCat
  // not configured, still loading, or a DB-only trial with no real
  // product behind it at all). Previously this whole component just
  // hardcoded "$5.99/mo" regardless of what was actually purchased --
  // silently wrong even before the annual plan existed, for anyone on
  // a different real price than that stale number.
  const activePriceLabel = activePackage
    ? `${activePackage.product.priceString}${activePackage.packageType === 'ANNUAL' ? '/yr' : '/mo'}`
    : null;

  const trialDaysLeft = getTrialDaysLeft(subscriptionStatus, trialEndsAt);

  // Confirms first, same as ManageAccountSection's own "Delete account" --
  // both are one-tap-irreversible actions on this same destructive-red
  // treatment.
  function handleCancelTrial() {
    // "and saved recipes" dropped (Anabelle, 2026-09-15: Save/Favourite
    // was shelved for v1 scope, PR #222 -- "make sure its not stated
    // anywhere in the copy").
    Alert.alert('Cancel your trial?', "You'll lose access to grocery lists right away.", [
      { text: 'Keep trial', style: 'cancel' },
      {
        text: 'Cancel trial',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          const { error } = await cancelTrial();
          setCancelling(false);
          if (error) {
            Alert.alert('Something went wrong', error);
          }
        },
      },
    ]);
  }

  // No confirmation dialog first, unlike handleCancelTrial -- this
  // doesn't itself cancel anything, just opens the real place that does
  // (see MANAGE_SUBSCRIPTION_URL's header comment).
  async function handleCancelMembership() {
    const canOpen = await Linking.canOpenURL(MANAGE_SUBSCRIPTION_URL);
    if (canOpen) {
      Linking.openURL(MANAGE_SUBSCRIPTION_URL);
    } else {
      Alert.alert('Could not open subscription settings', "Manage your subscription from your device's Settings app.");
    }
  }

  // 0 when trialEndsAt is already past -- isSubscribed being true here
  // guarantees that can't happen (see the isSubscribed check below,
  // trialing only counts while trial_ends_at hasn't passed), but this
  // stays clamped defensively rather than assuming that invariant holds.
  const trialProgress = trialDaysLeft !== null ? Math.max(0, Math.min(1, trialDaysLeft / TRIAL_DAYS)) : 0;
  const urgency = TRIAL_URGENCY_STYLES[getTrialUrgencyTier(trialDaysLeft)];

  if (isSubscribed) {
    return subscriptionStatus === 'trialing' ? (
      <View style={styles.trialCard}>
        <View style={[styles.confirmBadge, { backgroundColor: urgency.bg }]}>
          <urgency.Icon size={14} color={urgency.strong} />
          <Text style={[styles.confirmBadgeText, { color: urgency.strong }]}>Free trial</Text>
        </View>
        <View style={styles.trialProgressRow}>
          <View style={styles.trialProgressTrack}>
            <View
              style={[styles.trialProgressFill, { width: `${trialProgress * 100}%`, backgroundColor: urgency.strong }]}
            />
          </View>
          <Text style={styles.trialProgressLabel}>
            {trialDaysLeft} {trialDaysLeft === 1 ? 'day' : 'days'} left
          </Text>
        </View>
        <Text style={styles.membershipSubtitle}>
          {activePriceLabel
            ? `Then ${activePriceLabel} · Cancel anytime`
            : `Then ${MONTHLY_PRICE_DISPLAY}/mo or ${ANNUAL_PRICE_DISPLAY}/yr (${ANNUAL_MONTHLY_EQUIVALENT_DISPLAY}/mo) · Cancel anytime`}
        </Text>
        <View style={styles.trialCardActions}>
          <Pressable
            style={styles.cancelTrialButton}
            onPress={handleCancelTrial}
            disabled={cancelling}
            hitSlop={4}
          >
            {cancelling ? (
              <ActivityIndicator color={ERROR} />
            ) : (
              <Text style={styles.cancelTrialButtonText}>Cancel trial</Text>
            )}
          </Pressable>
          <Pressable
            style={styles.subscribeButton}
            onPress={() => router.push({ pathname: '/upgrade', params: { reason: 'skip the rest of your trial' } })}
          >
            <Text style={styles.subscribeButtonText}>Subscribe</Text>
          </Pressable>
        </View>
      </View>
    ) : (
      <View style={styles.membershipCard}>
        <View style={styles.membershipCardRow}>
          <TrophyIcon size={20} color={INK} />
          <View style={styles.membershipTextBlock}>
            <Text style={styles.membershipTitle}>Grrunch Member</Text>
            {/* Billing cycle/renewal date, read-only -- real values once
                purchases go live (RevenueCat's CustomerInfo, via
                usePurchases' expirationDate/willRenew), "Manage in
                Settings" fallback for as long as they're not configured
                (see lib/purchases.tsx's own header comment on why this
                can't be an in-app toggle). */}
            <Text style={styles.membershipSubtitle}>
              {activePriceLabel
                ? willRenew && expirationDate
                  ? `${activePriceLabel} · Renews ${formatRenewalDate(expirationDate)}`
                  : expirationDate
                    ? `${activePriceLabel} · Auto-renew off, ends ${formatRenewalDate(expirationDate)}`
                    : `${activePriceLabel} · Manage in Settings`
                : 'Manage in Settings'}
            </Text>
          </View>
        </View>
        <Pressable style={styles.cancelMembershipButton} onPress={handleCancelMembership}>
          <Text style={styles.cancelMembershipButtonText}>Cancel membership</Text>
        </Pressable>
      </View>
    );
  }

  if (subscriptionStatus === 'trialing' || subscriptionStatus === 'expired') {
    return (
      <View style={styles.membershipExpiredCard}>
        <View style={styles.membershipExpiredRow}>
          <LockClosedIcon size={18} color={INK} />
          <View style={styles.membershipTextBlock}>
            {/* Same exact sentence as NotificationBell.tsx's lapsed-trial
                notification (Anabelle, 2026-09-17: "keep that same
                sentence from the notification and apply to the container
                in the membership section") -- both read TRIAL_ENDED_
                MESSAGE from lib/subscription.tsx so they can't drift
                apart in wording again. No specific price here -- unlike
                the trialing/active states above, a lapsed member hasn't
                picked a plan yet (they may switch between monthly/annual
                on resubscribe), so /upgrade (which shows both real
                prices) is the right place for that number, not a guess
                here. */}
            <Text style={styles.membershipTitle}>{TRIAL_ENDED_MESSAGE}</Text>
          </View>
        </View>
        <Pressable
          style={styles.subscribeButtonFull}
          onPress={() => router.push({ pathname: '/upgrade', params: { reason: 'renew your membership' } })}
        >
          <Text style={styles.subscribeButtonText}>Subscribe</Text>
        </Pressable>
      </View>
    );
  }

  return <UpgradeCta reason="unlock the full app" />;
}

const styles = StyleSheet.create({
  // White, no border (Anabelle, 2026-09-17: "we should remove the black
  // border on the grrunch member container" -- a same-day reversal of
  // the border this card had just gotten a few messages earlier, on
  // seeing it live: "Not sure about the UI if this Grrunch Member
  // container. Make it white as usual with the black border with an
  // icon that says more 'member' or 'premium'"). Icon went CheckBadgeIcon
  // (read "verified") -> StarIcon -> TrophyIcon ("Use a medal for the
  // icon" -- Heroicons, the only icon set in this app, has no literal
  // medal glyph; TrophyIcon is the closest same-family "achievement/
  // status" icon rather than pulling in a second icon library for one
  // glyph). Now also carries real billing-cycle info and a "Cancel
  // membership" button (same message: "i feel there should be like a
  // toggle to select or not auto renew, details e.g. billing cycle and
  // a cancel membership button" -- built as read-only billing details +
  // a deep-link-out cancel button instead of an in-app auto-renew
  // toggle, since Apple/Google don't let a third-party app control that
  // directly for a real store subscription; see MANAGE_SUBSCRIPTION_URL
  // above).
  membershipCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  membershipCardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // Same white/ERROR-border secondary-destructive treatment as
  // cancelTrialButton below, full width since it stands alone here (no
  // paired Subscribe button -- a member is already subscribed).
  cancelMembershipButton: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: ERROR,
    borderRadius: 24,
  },
  cancelMembershipButtonText: { color: ERROR, fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  // White, not ACCENT -- Anabelle's call (2026-09-11), the same white-fill
  // language as the app's other cards, rather than this being the one
  // filled-orange exception. Border added back (2026-09-14, her follow-up
  // call reversing the "no border" decision from the same day) -- matches
  // the 2px INK border convention every other "modal treatment" card in
  // the app already uses (mealCard, GroceryListView's emptyState, etc.).
  trialCard: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  // bg/text color set inline per urgency tier (TRIAL_URGENCY_STYLES,
  // lib/subscription.tsx) -- alignSelf:'flex-start' keeps it sized to
  // its own content, not stretched to the card's full width.
  confirmBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  confirmBadgeText: { fontSize: 11, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  trialProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trialProgressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F0F0F0',
    overflow: 'hidden',
  },
  // backgroundColor set inline per urgency tier, same as confirmBadge.
  trialProgressFill: { height: '100%', borderRadius: 4 },
  trialProgressLabel: { fontSize: 12, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  trialCardActions: { flexDirection: 'row', gap: 10 },
  // Real btn-secondary-destructive -- same pill shape/height as every
  // other paired-button row in the app (StatusScreen's primary/secondary,
  // login.tsx's primaryButton), just ERROR instead of INK/ACCENT, since
  // this is a real destructive action, not a lesser-emphasis one.
  cancelTrialButton: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: ERROR,
    borderRadius: 24,
  },
  cancelTrialButtonText: { color: ERROR, fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  subscribeButton: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 24,
  },
  subscribeButtonText: { color: INK, fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  // Not the old INK-filled pressable row (Anabelle, 2026-09-17: "make it
  // a white container, remove the chevron and add a button 'subscribe'
  // as a primary button in the container"), and not that white fill
  // either any more -- transparent + dashed border instead, same follow-
  // up call (2026-09-17): "There should be consistence and the subscribe
  // container everywhere should be transparent with a dashed border",
  // matching UpgradeCta.tsx's own card style. The Subscribe button below
  // stays solid ACCENT -- it's the one real primary action in the card,
  // unlike the card itself which is just the locked-state container.
  membershipExpiredCard: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: INK,
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  membershipExpiredRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  subscribeButtonFull: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 24,
  },
  membershipTextBlock: { flex: 1 },
  membershipTitle: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  membershipSubtitle: { fontSize: 12, color: '#5c3d1c', marginTop: 2 },
});
