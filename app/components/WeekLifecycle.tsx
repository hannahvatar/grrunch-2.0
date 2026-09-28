import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text } from 'react-native';

import { useLiveWeek } from '../lib/liveWeek';
import { useSelectedDeals } from '../lib/selectedDeals';
import { useSelectedMeals } from '../lib/selectedMeals';

const ACCENT = '#FFA955';
const INK = '#111';

// Weekly handover side effects (Anabelle, 2026-09-24) -- mounted once in
// app/_layout.tsx, inside the selection providers:
//   - Wednesday 11:59 pm close: clears the grocery list, and shows a modal
//     to anyone who was using the app at that moment so the screens
//     don't just go empty under them. Someone opening the app during the
//     gap sees the empty state instead -- no modal needed.
//   - New week published (Thursday 12:00 pm): clears the list again, since
//     anything on it belongs to the week that just ended.
//
// Modal copy below is a PLACEHOLDER -- Anabelle is providing the design
// and copy for the gap states.
export function WeekLifecycle() {
  const liveWeek = useLiveWeek();
  const { clearSelected } = useSelectedMeals();
  const { clearDealsSelected } = useSelectedDeals();
  const [showClosedModal, setShowClosedModal] = useState(false);
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
    if (justClosed) setShowClosedModal(true);
  }, [liveWeek, clearSelected, clearDealsSelected]);

  return (
    <Modal visible={showClosedModal} transparent animationType="fade" onRequestClose={() => setShowClosedModal(false)}>
      <Pressable style={styles.backdrop} onPress={() => setShowClosedModal(false)}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>This week’s deals have ended</Text>
          <Text style={styles.body}>
            New deals and recipes drop Thursday at 12:00 pm. Your grocery list has been cleared for the new week.
          </Text>
          <Pressable style={styles.button} onPress={() => setShowClosedModal(false)}>
            <Text style={styles.buttonText}>Got it</Text>
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
