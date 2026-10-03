import { Modal, Pressable, StyleSheet, Text } from 'react-native';

const ACCENT = '#FFA955';
const INK = '#111';

interface StoreFilterNoticeModalProps {
  visible: boolean;
  // "Got it": go ahead and unselect the store (the caller also records
  // that this notice has been seen, so it only ever shows once).
  onConfirm: () => void;
  // "Keep all stores" / backdrop tap: leave the store selected.
  onCancel: () => void;
}

// Shown the first time someone unselects a store chip on Weekly Deals
// (Anabelle, 2026-10-02). The chips are a page-only filter, so the copy
// is careful to say recipes and their prices are NOT affected -- they
// still use every store's deals. Same backdrop + centered white/INK-
// border card as OutsideAreaModal.tsx.
export function StoreFilterNoticeModal({ visible, onConfirm, onCancel }: StoreFilterNoticeModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Showing fewer stores</Text>
          <Text style={styles.body}>
            Unselecting a store hides its deals on this page, so you'll see fewer deals. Recipes and their prices
            still include deals from every store.
          </Text>
          <Pressable style={styles.primaryButton} onPress={onConfirm}>
            <Text style={styles.primaryButtonText}>Got it</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={onCancel} hitSlop={8}>
            <Text style={styles.secondaryButtonText}>Keep all stores</Text>
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
