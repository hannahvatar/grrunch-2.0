import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { XMarkIcon } from 'react-native-heroicons/outline';

import { LegalSection } from '../lib/legalContent';

const ACCENT = '#FFA955';
const INK = '#111';

interface LegalDocumentModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  effectiveDate: string;
  intro: string;
  sections: LegalSection[];
  outro?: string;
  // When set, the modal shows a footer "Close" button in addition to the
  // header's X.
  showCloseButton?: boolean;
}

// Centered card modal (80% of the viewport in both dimensions) rather than
// a full-screen sheet -- shared by both the Terms of Use and Privacy Policy
// entry points on index.tsx so styling only needs to happen once.
export function LegalDocumentModal({
  visible,
  onClose,
  title,
  effectiveDate,
  intro,
  sections,
  outro,
  showCloseButton,
}: LegalDocumentModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.cardWrap}>
          <View pointerEvents="none" style={styles.cardShadow} />
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable style={styles.closeButton} onPress={onClose} hitSlop={8}>
              <XMarkIcon size={20} color={INK} />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.effectiveDate}>Effective Date: {effectiveDate}</Text>
            <Text style={styles.paragraph}>{intro}</Text>

            {sections.map((section) => (
              <View key={section.title} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.blocks.map((block, i) =>
                  block.type === 'text' ? (
                    <Text key={i} style={styles.paragraph}>
                      {block.value}
                    </Text>
                  ) : (
                    <View key={i} style={styles.bulletList}>
                      {block.items.map((item, j) => (
                        <View key={j} style={styles.bulletRow}>
                          <Text style={styles.bulletDot}>{'•'}</Text>
                          <Text style={styles.bulletText}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  )
                )}
              </View>
            ))}

            {outro && <Text style={styles.paragraph}>{outro}</Text>}
          </ScrollView>

          {showCloseButton && (
            <View style={styles.footer}>
              <Pressable style={styles.footerButton} onPress={onClose}>
                <Text style={styles.footerButtonText}>Close</Text>
              </Pressable>
            </View>
          )}
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,17,17,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardWrap: { width: '80%', height: '80%' },
  // Same flat, blur-free offset shadow as InputField's pressed state,
  // rendered as a real shape (not native shadow props) for identical
  // results on iOS, Android, and web.
  cardShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    borderRadius: 24,
    transform: [{ translateX: -1 }, { translateY: 1 }],
  },
  card: {
    width: '100%',
    height: '100%',
    position: 'relative',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 24,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#343837',
  },
  title: { fontSize: 18, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 32, gap: 16 },
  effectiveDate: { fontSize: 13, color: '#767676' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  paragraph: { fontSize: 14, lineHeight: 21, color: '#343837' },
  bulletList: { gap: 4 },
  bulletRow: { flexDirection: 'row', gap: 8 },
  bulletDot: { fontSize: 14, color: '#343837', lineHeight: 21 },
  bulletText: { flex: 1, fontSize: 14, lineHeight: 21, color: '#343837' },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: '#343837' },
  footerButton: {
    height: 56,
    justifyContent: 'center',
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 28,
    alignItems: 'center',
  },
  footerButtonText: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
});
