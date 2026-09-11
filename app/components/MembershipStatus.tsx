import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CheckBadgeIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  XCircleIcon,
} from 'react-native-heroicons/outline';

import { useSubscribeNow } from '../lib/purchases';
import { TRIAL_DAYS, useSubscription } from '../lib/subscription';
import { UpgradeCta } from './UpgradeCta';

const ACCENT = '#FFA955';
const INK = '#111';
// Matches ManageAccountSection.tsx's own ERROR const -- same red used for
// "Delete account" there, now this card's "Cancel trial".
const ERROR = '#D0342C';
// The trial card's badge/progress-bar color escalates through the GRRUNCH
// DS's real success/warning/error variants (Figma "Mobile Alert Banners",
// node 4076-104 -- same spec AlertBanner.tsx already implements; these are
// its exact colors, not the different, unrelated green MealCard's
// groceryConfirmBadge happens to use) as the trial gets closer to ending.
// Thresholds (Anabelle, 2026-09-11): >7 days is no-urgency success, 3-7
// days is a warning (same "one week left" mental model most trial-reminder
// emails already use, so the in-app color lines up with that rather than
// surprising someone), 0-2 days is error -- genuinely urgent, about to
// lose access.
const TRIAL_URGENCY = {
  success: { bg: '#E8F5E9', strong: '#1E7B34', Icon: CheckCircleIcon },
  warning: { bg: '#FFF4E5', strong: '#93450B', Icon: ExclamationTriangleIcon },
  error: { bg: '#FDECEC', strong: '#B42318', Icon: XCircleIcon },
} as const;

function getTrialUrgency(daysLeft: number | null) {
  if (daysLeft !== null && daysLeft <= 2) return TRIAL_URGENCY.error;
  if (daysLeft !== null && daysLeft <= 7) return TRIAL_URGENCY.warning;
  return TRIAL_URGENCY.success;
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
  const [cancelling, setCancelling] = useState(false);
  const { subscribeNow, subscribing } = useSubscribeNow();

  const trialDaysLeft =
    subscriptionStatus === 'trialing' && trialEndsAt
      ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : null;

  // Confirms first, same as ManageAccountSection's own "Delete account" --
  // both are one-tap-irreversible actions on this same destructive-red
  // treatment.
  function handleCancelTrial() {
    Alert.alert('Cancel your trial?', "You'll lose access to grocery lists and saved recipes right away.", [
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

  // 0 when trialEndsAt is already past -- isSubscribed being true here
  // guarantees that can't happen (see the isSubscribed check below,
  // trialing only counts while trial_ends_at hasn't passed), but this
  // stays clamped defensively rather than assuming that invariant holds.
  const trialProgress = trialDaysLeft !== null ? Math.max(0, Math.min(1, trialDaysLeft / TRIAL_DAYS)) : 0;
  const urgency = getTrialUrgency(trialDaysLeft);

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
        <Text style={styles.membershipSubtitle}>Then $5.99/mo · Cancel anytime</Text>
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
          <Pressable style={styles.subscribeButton} onPress={subscribeNow} disabled={subscribing} hitSlop={4}>
            {subscribing ? (
              <ActivityIndicator color={INK} />
            ) : (
              <Text style={styles.subscribeButtonText}>Subscribe</Text>
            )}
          </Pressable>
        </View>
      </View>
    ) : (
      <View style={styles.membershipCard}>
        <CheckBadgeIcon size={20} color={INK} />
        <View style={styles.membershipTextBlock}>
          <Text style={styles.membershipTitle}>Grrunch Member</Text>
          <Text style={styles.membershipSubtitle}>$5.99/mo · Manage in Settings</Text>
        </View>
      </View>
    );
  }

  if (subscriptionStatus === 'trialing' || subscriptionStatus === 'expired') {
    return (
      <Pressable
        style={styles.membershipExpiredCard}
        onPress={() => router.push({ pathname: '/upgrade', params: { reason: 'renew your membership' } })}
      >
        <LockClosedIcon size={18} color="#fff" />
        <View style={styles.membershipTextBlock}>
          <Text style={styles.membershipTitleLight}>Your trial has ended</Text>
          <Text style={styles.membershipSubtitleLight}>Resubscribe for $5.99/mo to keep saving recipes</Text>
        </View>
        <ChevronRightIcon size={18} color="#999" />
      </Pressable>
    );
  }

  return <UpgradeCta reason="unlock the full app" />;
}

const styles = StyleSheet.create({
  membershipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: ACCENT,
    borderRadius: 14,
    padding: 14,
  },
  // White, not ACCENT -- Anabelle's call (2026-09-11), the same white-fill
  // language as the app's other cards, rather than this being the one
  // filled-orange exception. No border either (her follow-up call) -- the
  // confirmation badge below now carries the "this is really on" signal
  // instead of a bordered container.
  trialCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  // bg/text color set inline per urgency tier (see TRIAL_URGENCY above) --
  // alignSelf:'flex-start' keeps it sized to its own content, not
  // stretched to the card's full width.
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
  membershipExpiredCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: INK,
    borderRadius: 14,
    padding: 14,
  },
  membershipTextBlock: { flex: 1 },
  membershipTitle: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  membershipSubtitle: { fontSize: 12, color: '#5c3d1c', marginTop: 2 },
  membershipTitleLight: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: '#fff' },
  membershipSubtitleLight: { fontSize: 12, color: '#ccc', marginTop: 2 },
});
