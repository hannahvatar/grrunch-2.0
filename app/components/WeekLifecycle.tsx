import { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text } from 'react-native';

import { acknowledgeWeekChange, type WeekChange, useLiveWeek, usePendingWeekChange } from '../lib/liveWeek';
import { useSelectedDeals } from '../lib/selectedDeals';
import { useSelectedMeals } from '../lib/selectedMeals';

const ACCENT = '#FFA955';
const INK = '#111';

// Weekly handover (Anabelle, 2026-09-24, softened 2026-09-28 because it
// "feels abrupt") -- mounted once in app/_layout.tsx, inside the
// selection providers:
//   - Wednesday 11 pm: a banner with a countdown on Meals, Weekly Deals and
//     My list (ClosingSoonBanner.tsx).
//   - Wednesday 11:59 pm close, while the app is open: a popup over this
//     week's screens. They switch to the countdown empty state and the
//     grocery list clears only once it's tapped.
//   - New week published (Thursday 12:00 pm), while the app is open: a
//     popup, and the new week loads when it's tapped.
//   - Either change while the app was in the background: no popup, the
//     screens are simply up to date when it comes back.
// The grocery list clears whenever the screens move to a new state
// (close or new week), since anything on it belongs to the week that
// just ended.
const POPUPS: Record<WeekChange, { title: string; body: string; button: string }> = {
  closed: {
    title: "That's a wrap for this week",
    body: "This week's meals and deals have ended, and your grocery list is cleared. New ones drop Thursday at 12:00 pm.",
    button: 'Got it',
  },
  newWeek: {
    title: 'New meals and deals are here!',
    body: 'Fresh from this week\'s flyers.',
    button: "Let's see",
  },
};

export function WeekLifecycle() {
  const liveWeek = useLiveWeek();
  const pending = usePendingWeekChange();
  const { clearSelected } = useSelectedMeals();
  const { clearDealsSelected } = useSelectedDeals();
  const previous = useRef(liveWeek);

  useEffect(() => {
    const before = previous.current;
    previous.current = liveWeek;
    if (!before || !liveWeek) return;

    const justClosed = !before.closed && liveWeek.closed && before.publishedAt === liveWeek.publishedAt;
    const newWeek = before.publishedAt !== liveWeek.publishedAt;
    if (justClosed || newWeek) {
      clearSelected();
      clearDealsSelected();
    }
  }, [liveWeek, clearSelected, clearDealsSelected]);

  const popup = pending ? POPUPS[pending] : null;

  return (
    <Modal visible={!!popup} transparent animationType="fade" onRequestClose={acknowledgeWeekChange}>
      <Pressable style={styles.backdrop} onPress={acknowledgeWeekChange}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{popup?.title}</Text>
          <Text style={styles.body}>{popup?.body}</Text>
          <Pressable style={styles.button} onPress={acknowledgeWeekChange}>
            <Text style={styles.buttonText}>{popup?.button}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Same backdrop + white/INK-border card as OutsideAreaModal.
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 20,
    padding: 24,
    gap: 12,
  },
  title: { fontSize: 20, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  body: { fontSize: 15, lineHeight: 21, color: INK },
  button: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 28,
    marginTop: 4,
  },
  buttonText: { color: INK, fontSize: 17, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
});
