import { router } from 'expo-router';
import { Pressable, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { LockClosedIcon } from 'react-native-heroicons/outline';

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
// One layout everywhere (Anabelle, 2026-10-30: "so it matches the other
// cards"): a dashed, transparent card, content centred -- lock icon, title
// (default "Unlock everything"; callers pass "Unlock 9 more recipes" etc.),
// the black trial line, the button right under it, and the food bank
// mission at the very bottom at full width. It started as Home's locked
// 4th tile (2026-10-26); Profile's left-aligned card and the compact row
// used on My list were retired the same day. Callers size it with `style`
// where it sits in a row or grid.
export function UpgradeCta({
  reason,
  title,
  style,
}: {
  reason: string;
  // Only one layout now; kept so existing callers' variant="tile" still
  // type-checks.
  variant?: 'tile';
  title?: string;
  style?: StyleProp<ViewStyle>;
}) {
  function goToUpgrade() {
    router.push({ pathname: '/upgrade', params: { reason } });
  }

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
      {/* Every trial card ends with the food bank mission, under the
          button (Anabelle, 2026-10-30: "Wherever there is a trial card,
          I want this treatment"). */}
      <FoodBankMission variant="join" centered />
    </View>
  );
}

const styles = StyleSheet.create({
  // Transparent + dashed -- see the header comment.
  card: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: INK,
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 14,
  },
  // Same real btn-primary-orange as MembershipStatus.tsx's own
  // subscribeButton (ACCENT fill, 2px INK border, 24px radius) -- full
  // width here since it stands alone, not paired with a second button.
  // Right under the "30-day free trial" line (Anabelle, 2026-10-30; was 14).
  ctaButton: {
    marginTop: 10,
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
  tileSubtitle: { color: INK, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 320 },
  // Full tile width on narrow tiles, capped on the wide desktop card.
  // Grows to two lines on a narrow phone tile instead of overflowing.
  tileButton: {
    // The tile's own 8 px gap already separates it from the line above.
    marginTop: 0,
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
