import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRightIcon, LockClosedIcon } from 'react-native-heroicons/outline';

import { ANNUAL_MONTHLY_EQUIVALENT_DISPLAY } from '../lib/purchases';

const ACCENT = '#FFA955';
const INK = '#111';

// Inline teaser shown beside a locked, paid-tier feature -- always routes
// to the shared /upgrade modal (app/upgrade.tsx), which is where the real
// "start trial" action happens (creates an account first if needed), so
// every locked-feature entry point shows the same explainer + price
// before committing, rather than each one having its own logic.
//
// variant 'solid' (default) is Profile's Membership section (the page's
// one real top-level "you're not a member" banner) -- white fill, solid
// 2px INK border (Anabelle, 2026-09-15, on seeing this all-black: "i
// didnt like it" -- was a solid #111 fill with white text, the one card
// on the page that broke from the app's white-card/peach-bg/orange-accent
// language). Now matches MembershipStatus.tsx's own trialCard shape too
// (info block on top, a real button below), not just its colors --
// Anabelle's immediate follow-up: "remove the chevron and add a primary
// button at the bottom of the container with the label 'Start free
// trial'". The whole card is no longer one big Pressable -- only the
// button is, same explicit-affordance pattern the app already uses
// elsewhere (e.g. profile.tsx's viewSavedButton alongside a tappable
// row) rather than an implicit whole-card tap.
//
// variant 'outline' is the next-to-feature dashed treatment used by
// Grocery list's empty state -- unchanged by the above, still a single
// tappable row with a trailing chevron, since that's a lighter-weight
// secondary-section prompt, not the page's primary conversion moment.
// outlineFill="transparent" lets Grocery list's version show the
// screen's own peach background through instead of a white card
// (Anabelle's call, same treatment Meals' own one-off unlockCard uses).
export function UpgradeCta({
  reason,
  variant = 'solid',
  outlineFill = 'white',
}: {
  reason: string;
  variant?: 'solid' | 'outline';
  outlineFill?: 'white' | 'transparent';
}) {
  function goToUpgrade() {
    router.push({ pathname: '/upgrade', params: { reason } });
  }

  if (variant === 'outline') {
    return (
      <Pressable
        style={[
          styles.card,
          styles.outlineRow,
          outlineFill === 'transparent' && styles.outlineTransparent,
        ]}
        onPress={goToUpgrade}
      >
        <LockClosedIcon size={18} color={INK} />
        <View style={styles.textBlock}>
          <Text style={styles.title}>Start 30-day free trial</Text>
          <Text style={styles.subtitle}>Then from {ANNUAL_MONTHLY_EQUIVALENT_DISPLAY}/mo · Cancel anytime</Text>
        </View>
        <ChevronRightIcon size={18} color="#999" />
      </Pressable>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.infoRow}>
        <LockClosedIcon size={18} color={INK} />
        <View style={styles.textBlock}>
          <Text style={styles.title}>Start 30-day free trial</Text>
          {/* "From" the annual-equivalent monthly rate, the cheaper of
              the two real plans (Anabelle, 2026-09-15: monthly $7.99 or
              annual $69.99) -- this is a lightweight inline teaser, not
              the actual plan picker (that's /upgrade, which the button
              below always routes to and where both real prices are
              shown), so one honest "as low as" number reads better here
              than spelling out both. */}
          <Text style={styles.subtitle}>Then from {ANNUAL_MONTHLY_EQUIVALENT_DISPLAY}/mo · Cancel anytime</Text>
        </View>
      </View>
      <Pressable style={styles.ctaButton} onPress={goToUpgrade}>
        {/* "Start 30-day free trial", matching the title right above it
            and /upgrade's own primary button -- Anabelle, 2026-09-15:
            "it should be consistent everywhere" (this button first read
            "Start free trial", the shorter wording she'd given a moment
            earlier, before every other instance of this CTA in the app
            spells out the full "30-day"). */}
        <Text style={styles.ctaButtonText}>Start 30-day free trial</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 14,
    padding: 14,
  },
  // outline variant only -- a single tappable row (icon, text, chevron).
  outlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  outlineTransparent: {
    backgroundColor: 'transparent',
  },
  // solid variant only -- the icon+text header row sits above its own
  // separate ctaButton, not inline with it.
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  textBlock: { flex: 1 },
  title: { color: INK, fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  subtitle: { color: '#666', fontSize: 12, marginTop: 2 },
  // Same real btn-primary-orange as MembershipStatus.tsx's own
  // subscribeButton (ACCENT fill, 2px INK border, 24px radius) -- full
  // width here since it stands alone, not paired with a second button.
  ctaButton: {
    marginTop: 14,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 24,
  },
  ctaButtonText: { color: INK, fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
});
