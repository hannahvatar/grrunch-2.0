import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckBadgeIcon, ChevronRightIcon, LockClosedIcon } from 'react-native-heroicons/outline';

import { useSubscription } from '../lib/subscription';
import { UpgradeCta } from './UpgradeCta';

const ACCENT = '#FFA955';
const INK = '#111';

// Real subscription status card -- extracted from profile.tsx's
// Membership section (Anabelle, 2026-08-28) so payment.tsx can show the
// exact same real status instead of duplicating the isSubscribed/
// trialing/expired/none branching a second time. Assumes the caller has
// already checked isGuest (see lib/auth.tsx) -- this component only
// handles the four subscription states, not the signed-out state, since
// what a guest should see differs by context (Manage account vs Payment).
export function MembershipStatus() {
  const { status: subscriptionStatus, trialEndsAt, isSubscribed } = useSubscription();

  const trialDaysLeft =
    subscriptionStatus === 'trialing' && trialEndsAt
      ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : null;

  if (isSubscribed) {
    return subscriptionStatus === 'trialing' ? (
      <View style={styles.membershipCard}>
        <CheckBadgeIcon size={20} color={INK} />
        <View style={styles.membershipTextBlock}>
          <Text style={styles.membershipTitle}>
            Free trial · {trialDaysLeft} {trialDaysLeft === 1 ? 'day' : 'days'} left
          </Text>
          <Text style={styles.membershipSubtitle}>Then $5.99/mo · Cancel anytime</Text>
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
