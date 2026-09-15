import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRightIcon, LockClosedIcon } from 'react-native-heroicons/outline';

import { ANNUAL_MONTHLY_EQUIVALENT_DISPLAY } from '../lib/purchases';

const INK = '#111';

// Inline teaser shown beside a locked, paid-tier feature -- always routes
// to the shared /upgrade modal (app/upgrade.tsx), which is where the real
// "start trial" action happens (creates an account first if needed), so
// every locked-feature entry point shows the same explainer + price
// before committing, rather than each one having its own logic.
//
// variant 'solid' (default) is the original black-fill treatment, used by
// Profile's Membership section (the page's one real top-level "you're not
// a member" banner). variant 'outline' is the next-to-feature dashed
// treatment used for Saved recipes/Companion recipes/Grocery list's empty
// state -- same content and route, just a lighter-weight look for a
// locked secondary section rather than the page's primary conversion
// moment. Its fill defaults to white (Saved/Companion recipes, sitting
// inline mid-page), but Grocery list's version wants the screen's own
// peach background to show through instead of a white card floating on
// it (Anabelle's call, same transparent-outline treatment Meals' own
// one-off unlockCard already uses) -- outlineFill="transparent" opts out
// per-usage without changing Saved/Companion recipes' look.
export function UpgradeCta({
  reason,
  variant = 'solid',
  outlineFill = 'white',
}: {
  reason: string;
  variant?: 'solid' | 'outline';
  outlineFill?: 'white' | 'transparent';
}) {
  const outline = variant === 'outline';
  return (
    <Pressable
      style={[
        styles.container,
        outline && styles.containerOutline,
        outline && outlineFill === 'transparent' && styles.containerOutlineTransparent,
      ]}
      onPress={() => router.push({ pathname: '/upgrade', params: { reason } })}
    >
      <LockClosedIcon size={18} color={outline ? INK : '#fff'} />
      <View style={styles.textBlock}>
        <Text style={[styles.title, outline && styles.titleOutline]}>Start 30-day free trial</Text>
        {/* "From" the annual-equivalent monthly rate, the cheaper of the
            two real plans (Anabelle, 2026-09-15: monthly $7.99 or annual
            $69.99) -- this is a lightweight inline teaser, not the actual
            plan picker (that's /upgrade, which this always routes to and
            where both real prices are shown), so one honest "as low as"
            number reads better here than spelling out both. */}
        <Text style={[styles.subtitle, outline && styles.subtitleOutline]}>
          Then from {ANNUAL_MONTHLY_EQUIVALENT_DISPLAY}/mo · Cancel anytime
        </Text>
      </View>
      <ChevronRightIcon size={18} color={outline ? INK : '#999'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#111',
    borderRadius: 14,
    padding: 14,
  },
  containerOutline: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: INK,
  },
  containerOutlineTransparent: {
    backgroundColor: 'transparent',
  },
  textBlock: { flex: 1 },
  title: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  titleOutline: { color: INK },
  subtitle: { color: '#ccc', fontSize: 12, marginTop: 2 },
  subtitleOutline: { color: '#666' },
});
