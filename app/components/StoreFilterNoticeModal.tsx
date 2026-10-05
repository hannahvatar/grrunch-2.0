import { Modal, Pressable, StyleSheet, Text } from 'react-native';

import type { StoreFilterScope } from '../lib/storeFilter';

const ACCENT = '#FFA955';
const INK = '#111';

// One notice per page (Anabelle, 2026-10-05) -- each page's chips have
// their own selection and say what unselecting does THERE.
const COPY: Record<StoreFilterScope, { title: string; body: string }> = {
  deals: {
    title: 'Showing fewer stores',
    body: "Unselecting a store hides its deals, so you'll see fewer deals.",
  },
  meals: {
    title: 'Prices may go up',
    body: 'As you remove stores, their sale items switch to regular price, so prices per serving will go up.',
  },
};

interface StoreFilterNoticeModalProps {
  scope: StoreFilterScope;
  visible: boolean;
  // "Got it": go ahead and unselect the store (the caller also records
  // that this notice has been seen, so it only ever shows once).
  onConfirm: () => void;
  // "Keep all stores" / backdrop tap: leave the store selected.
  onCancel: () => void;
}

// Shown the first time someone unselects a store chip on a page (see
// components/StoreChips.tsx). Same backdrop + centered white/INK-border
// card as OutsideAreaModal.tsx.
export function StoreFilterNoticeModal({ scope, visible, onConfirm, onCancel }: StoreFilterNoticeModalProps) {
  const { title, body } = COPY[scope];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <Pressable style={styles.primaryButton} onPress={onConfirm}>
            <Text style={styles.primaryButtonText}>Got it</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={onCancel} hitSlop={12}>
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
