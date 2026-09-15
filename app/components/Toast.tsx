import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CheckCircleIcon } from 'react-native-heroicons/outline';

const INK = '#111';
// Same light-green confirmation scheme as MembershipStatus.tsx's "Free
// trial" badge / MealCard's "Added" badge (bg #E8F5E9, icon/text
// #1E7B34) -- the app's one established "something succeeded" color
// language, reused here instead of inventing a new one for this.
const SUCCESS_BG = '#E8F5E9';
const SUCCESS_STRONG = '#1E7B34';

// Lightweight, auto-dismissing confirmation toast -- floats over the
// whole screen for a couple seconds, then hides itself. Built for
// ManageAccountSection.tsx's Save button (Anabelle, 2026-09-15: "saving
// the changes/addition should trigger the confirmation toast
// component"), replacing the plain inline "Saved." text that used to
// sit next to the button.
//
// Deliberately a plain View, not Animated.View -- a fade tried first
// (Animated.Value + useNativeDriver) rendered nothing at all here
// (opacity silently stuck at its initial 0, confirmed by swapping in
// this exact plain View with everything else identical and having it
// render immediately). Not worth chasing further for a two-second
// confirmation toast -- an instant show/hide reads perfectly fine.
//
// Render this once at the SCREEN's own root View (a sibling of its
// ScrollView, not nested inside one) so `position: absolute` floats it
// over the whole screen regardless of scroll position -- see
// app/manage-account.tsx. The screen owns the visible/onHide state
// (typically a single boolean flipped true right after a successful
// save); this component owns only its own auto-hide timer.
export function Toast({ visible, message, onHide }: { visible: boolean; message: string; onHide: () => void }) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onHide, 2200);
    return () => clearTimeout(timer);
  }, [visible, onHide]);

  if (!visible) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      <CheckCircleIcon size={18} color={SUCCESS_STRONG} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fixed near the bottom of the screen -- clear of both the header
  // (top) and any keyboard that might be up while editing a form field
  // just above it.
  container: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: SUCCESS_BG,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: SUCCESS_STRONG,
    paddingVertical: 14,
    paddingHorizontal: 16,
    // Real elevation/shadow -- this floats above scrolled content, so it
    // should read as sitting above the page, not flush with it.
    shadowColor: INK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  text: { color: SUCCESS_STRONG, fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
});
