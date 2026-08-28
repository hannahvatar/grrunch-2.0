import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { XMarkIcon } from 'react-native-heroicons/outline';

// About is real copy (Anabelle, 2026-08-28, revised same day -- felt over
// explained, not a step-by-step of the machinery) -- everything else on
// this shared stub screen is still the honest "not built yet" placeholder.
const ABOUT_PARAGRAPHS: { text: string; bold?: boolean }[] = [
  { text: 'Grrunch turns grocery deals into real, affordable meals.' },
  {
    text: 'Every week, we sort through the noise to find the grocery deals actually worth bringing home. Then we turn them into practical, delicious recipes designed around what’s good right now and what it really costs.',
  },
  {
    text: 'No hunting through flyers. No wondering if a sale is really a deal. Just smarter ways to shop, cook, and make your grocery budget go further.',
  },
  { text: 'Spend less. Cook something good. Grrunch the deals.', bold: true },
];

// Shared stub destination for the Settings rows that don't have real
// content yet (Privacy, Legal) -- one honest "not built yet" screen
// rather than several fabricated ones. Get support used to land here too
// (title="Get support") but now has its own real screen, get-support.tsx.
export default function SettingsDetailScreen() {
  const { title } = useLocalSearchParams<{ title?: string }>();
  const isAbout = title === 'About';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title ?? 'Settings'}</Text>
        {/* Same tertiary closing treatment as settings.tsx/manage-account.tsx's
            closeButton -- was a "< Back" text link, Anabelle's call to make
            it consistent with the rest of Settings' screens. */}
        <Pressable style={styles.closeButton} onPress={() => router.back()} hitSlop={8}>
          <XMarkIcon size={18} color="#111" />
        </Pressable>
      </View>
      {isAbout ? (
        <ScrollView contentContainerStyle={styles.aboutContent}>
          {ABOUT_PARAGRAPHS.map((paragraph, i) => (
            <Text key={i} style={[styles.aboutParagraph, paragraph.bold && styles.aboutParagraphBold]}>
              {paragraph.text}
            </Text>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.body}>
          <Text style={styles.bodyText}>This isn't available yet — check back soon.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // GRRUNCH DS peach background, matches settings.tsx/manage-account.tsx.
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
    borderColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  bodyText: { fontSize: 14, color: '#888', textAlign: 'center' },
  aboutContent: { paddingHorizontal: 24, paddingBottom: 40, gap: 16 },
  aboutParagraph: { fontSize: 15, lineHeight: 22, color: '#111' },
  aboutParagraphBold: { fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
});
