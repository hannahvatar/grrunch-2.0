import { router } from 'expo-router';
import { Pressable, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { ChevronRightIcon, LockClosedIcon } from 'react-native-heroicons/outline';

import { ANNUAL_MONTHLY_EQUIVALENT_DISPLAY } from '../lib/purchases';
import { FoodBankMission } from './FoodBankMission';

const ACCENT = '#FFA955';
const INK = '#111';

// Inline teaser shown beside a locked, paid-tier feature -- always routes
// to the shared /upgrade modal (app/upgrade.tsx), which is where the real
// "start trial" action happens (creates an account first if needed), so
// every locked-feature entry point shows the same explainer + price
// before committing, rather than each one having its own logic.
//
// variant 'solid' (default) is Profile's Membership section (the page's
// one real top-level "you're not a member" banner) -- matches
// MembershipStatus.tsx's own trialCard shape (info block on top, a real
// button below): Anabelle, 2026-09-15, "remove the chevron and add a
// primary button at the bottom of the container with the label 'Start
// free trial'". The whole card is no longer one big Pressable -- only
// the button is, same explicit-affordance pattern the app already uses
// elsewhere (e.g. profile.tsx's viewSavedButton alongside a tappable
// row) rather than an implicit whole-card tap.
//
// variant 'outline' is the next-to-feature treatment used by Grocery
// list's empty state -- a single tappable row with a trailing chevron,
// since that's a lighter-weight secondary-section prompt, not the page's
// primary conversion moment.
//
// Both variants share the one `card` style below -- transparent fill,
// dashed INK border (Anabelle, 2026-09-17: "There should be consistence
// and the subscribe container everywhere should be transparent with a
// dashed border"). Was a solid-bordered white fill for 'solid' and a
// per-caller `outlineFill` prop (defaulting to white, only Grocery
// list's own call site opted into transparent) for 'outline' -- same
// look now everywhere, no prop needed to ask for it.
//
// variant 'tile' is a locked card that takes the place of the next card
// in a row or grid (Home's recipe carousel and deals grid for
// non-members, Anabelle 2026-10-26: "there should be a 4th recipes card
// ... showing the subscription message. Same for the deals"). Same dashed
// card, content centred, with its own `title` ("Unlock 9 more recipes");
// the caller sizes it (`style`) to match its neighbours.
export function UpgradeCta({
  reason,
  variant = 'solid',
  title,
  style,
  mission = false,
}: {
  reason: string;
  variant?: 'solid' | 'outline' | 'tile';
  title?: string;
  style?: StyleProp<ViewStyle>;
  // The food bank mission inside the card, above the button (Anabelle,
  // 2026-10-30): Profile > Membership's solid card and Home's recipe tile.
  mission?: boolean;
}) {
  function goToUpgrade() {
    router.push({ pathname: '/upgrade', params: { reason } });
  }

  if (variant === 'tile') {
    return (
      <View style={[styles.card, styles.tile, style]}>
        <View style={styles.tileIcon}>
          <LockClosedIcon size={22} color={INK} />
        </View>
        <Text style={styles.tileTitle}>{title ?? 'Unlock everything'}</Text>
        <Text style={styles.tileSubtitle}>
          30-day free trial · Then from {ANNUAL_MONTHLY_EQUIVALENT_DISPLAY}/mo · Cancel anytime
        </Text>
        <Pressable style={[styles.ctaButton, styles.tileButton]} onPress={goToUpgrade}>
          <Text style={[styles.ctaButtonText, styles.tileButtonText]}>Start 30-day free trial</Text>
        </Pressable>
        {/* At the bottom of the tile, under the button (Anabelle,
            2026-10-30). */}
        {mission && <FoodBankMission variant="join" centered />}
      </View>
    );
  }

  if (variant === 'outline') {
    return (
      <Pressable style={[styles.card, styles.outlineRow]} onPress={goToUpgrade}>
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
      {mission && <FoodBankMission variant="join" />}
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
  // Transparent + dashed, both variants -- see the header comment.
  card: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: INK,
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 14,
  },
  // outline variant only -- a single tappable row (icon, text, chevron),
  // thinner border than the solid variant's card.
  outlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
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
  // tile variant only.
  tile: { alignItems: 'center', justifyContent: 'center', padding: 16, gap: 8 },
  tileIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tileTitle: { color: INK, fontSize: 18, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', textAlign: 'center' },
  tileSubtitle: { color: '#555', fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 320 },
  // Full tile width on narrow tiles, capped on the wide desktop card.
  // Grows to two lines on a narrow phone tile instead of overflowing.
  tileButton: {
    alignSelf: 'stretch',
    maxWidth: 320,
    width: '100%',
    marginHorizontal: 'auto',
    height: 'auto',
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tileButtonText: { textAlign: 'center' },
});
