import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { XMarkIcon } from 'react-native-heroicons/outline';

import { LegalDocumentBody } from '../components/LegalDocumentBody';
import { PRIVACY_POLICY_EFFECTIVE_DATE, PRIVACY_POLICY_INTRO, PRIVACY_POLICY_SECTIONS } from '../lib/privacyPolicy';

const INK = '#111';

// Settings > Privacy -- the same real Privacy Policy shown on the
// first-run consent screen (index.tsx, via LegalDocumentModal), now also
// reachable from Settings instead of the generic "not built yet" stub
// (Anabelle, 2026-08-28).
export default function PrivacyPolicyScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Privacy Policy</Text>
        <Pressable style={styles.closeButton} onPress={() => router.back()} hitSlop={8}>
          <XMarkIcon size={18} color={INK} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <LegalDocumentBody
            effectiveDate={PRIVACY_POLICY_EFFECTIVE_DATE}
            intro={PRIVACY_POLICY_INTRO}
            sections={PRIVACY_POLICY_SECTIONS}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // GRRUNCH DS peach background, matches settings.tsx/how-it-works.tsx.
  container: { flex: 1, backgroundColor: '#FFEAD4' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 60,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  content: { paddingHorizontal: 24, paddingBottom: 40 },
  // White card, matches get-support.tsx's FAQ container / how-it-works.tsx's
  // table -- same GRRUNCH DS "content lives in a white card on the peach
  // page" pattern.
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: INK,
    borderRadius: 12,
    padding: 20,
    gap: 16,
  },
});
