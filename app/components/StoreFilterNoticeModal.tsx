import { Modal, Pressable, StyleSheet, Text } from 'react-native';

const ACCENT = '#FFA955';
const INK = '#111';

interface StoreFilterNoticeModalProps {
  // The store about to be turned off; null = closed.
  chain: string | null;
  // "Keep <store>" / backdrop tap: leave it selected (the main action --
  // the modal deliberately nudges toward keeping every store).
  onKeep: () => void;
  // "Turn it off anyway": go ahead and unselect it.
  onTurnOff: () => void;
}

// Shown EVERY time a store chip is turned off (Anabelle, 2026-10-05), on
// Weekly Deals, Meals or My list -- the selection is shared by all three
// (lib/storeFilter.tsx), so one choice costs deals and recipe prices
// everywhere. Same backdrop + centered white/INK-border card as
// OutsideAreaModal.tsx.
export function StoreFilterNoticeModal({ chain, onKeep, onTurnOff }: StoreFilterNoticeModalProps) {
  return (
    <Modal visible={chain !== null} transparent animationType="fade" onRequestClose={onKeep}>
      <Pressable style={styles.backdrop} onPress={onKeep}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Keep {chain} for the lowest prices?</Text>
          <Text style={styles.body}>
            Without {chain}, you'll see fewer deals and recipe prices per serving go up.
          </Text>
          <Pressable style={styles.primaryButton} onPress={onKeep}>
            <Text style={styles.primaryButtonText}>Keep {chain}</Text>
          </Pressable>
          <Pressable style={tertiaryStyles.button} onPress={onTurnOff}>
            <Text style={tertiaryStyles.text}>Turn it off anyway</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

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
  // Real btn-primary-orange, same spec as OutsideAreaModal's primaryButton.
  primaryButton: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 28,
    marginTop: 4,
  },
  primaryButtonText: { color: INK, fontSize: 17, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
});

interface StoreReminderModalProps {
  visible: boolean;
  offCount: number;
  onAddAllBack: () => void;
  onKeepSelection: () => void;
}

// "N stores off" reminder (Anabelle, 2026-10-05): shown once per page per
// session when Weekly Deals, Meals or My list opens with stores turned off
// (see StoreChips). Replaces the inline reminder line. "Keep my
// selection" is a tertiary button (tertiaryStyles below).
export function StoreReminderModal({ visible, offCount, onAddAllBack, onKeepSelection }: StoreReminderModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onKeepSelection}>
      <Pressable style={styles.backdrop} onPress={onKeepSelection}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>
            {offCount} store{offCount === 1 ? '' : 's'} off
          </Text>
          <Text style={styles.body}>You may be missing lower prices.</Text>
          <Pressable style={styles.primaryButton} onPress={onAddAllBack}>
            <Text style={styles.primaryButtonText}>Add all stores back</Text>
          </Pressable>
          <Pressable style={tertiaryStyles.button} onPress={onKeepSelection}>
            <Text style={tertiaryStyles.text}>Keep my selection</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Tertiary button (white fill, INK border) for both modals' second
// action -- same as signup-nudge.tsx's tertiaryButton.
const tertiaryStyles = StyleSheet.create({
  button: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 28,
  },
  text: { color: INK, fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
});
