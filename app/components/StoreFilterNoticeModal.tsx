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
          <Pressable style={styles.secondaryButton} onPress={onTurnOff} hitSlop={12}>
            <Text style={styles.secondaryButtonText}>Turn it off anyway</Text>
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
  secondaryButton: { alignItems: 'center', paddingVertical: 4 },
  secondaryButtonText: { fontSize: 16, color: INK, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold' },
});
