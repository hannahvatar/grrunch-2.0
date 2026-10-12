import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { XMarkIcon } from 'react-native-heroicons/outline';

// About is real copy -- Anabelle's own founder note (2026-10-12; replaces
// the 2026-08-28 product blurb). Everything else on this shared stub
// screen is still the honest "not built yet" placeholder. Each paragraph
// is a list of runs so part of a sentence can be bold.
const ABOUT_PARAGRAPHS: { text: string; bold?: boolean }[][] = [
  [
    { text: 'Grrunch was born from a belief I’ve carried for years: ' },
    { text: 'everyone deserves to eat well, no matter their budget.', bold: true },
  ],
  [
    {
      text: 'Food insecurity and rising grocery prices are struggles I’ve cared deeply about for a long time. Watching something as essential as a good meal become increasingly unaffordable is something I refuse to simply accept.',
    },
  ],
  [{ text: 'That’s why I created Grrunch.' }],
  [
    {
      text: 'I may not be able to solve food insecurity on my own, but I believe meaningful change starts somewhere. And if Grrunch can make life a little easier for even one person, put a good meal on someone’s table, or take a little worry out of grocery shopping, that alone would mean the world to me.',
    },
  ],
  [
    {
      text: 'We dig through grocery flyers, uncover deals that are actually worth it, and turn them into delicious, affordable meals. Because eating well shouldn’t mean spending a fortune, and making ends meet shouldn’t mean sacrificing good food.',
    },
  ],
  [{ text: 'Spend less. Cook something good. Grrunch the deals.', bold: true }],
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
          <XMarkIcon size={20} color="#111" />
        </Pressable>
      </View>
      {isAbout ? (
        <ScrollView contentContainerStyle={styles.aboutContent}>
          {/* White card, same treatment as My list's store cards
              (Anabelle, 2026-10-12: "move the about text into a white
              container"). */}
          <View style={styles.aboutCard}>
            <Text style={styles.aboutHeart}>🧡</Text>
            {ABOUT_PARAGRAPHS.map((runs, i) => (
              <Text key={i} style={styles.aboutParagraph}>
                {runs.map((run, r) => (
                  <Text key={r} style={run.bold && styles.aboutParagraphBold}>
                    {run.text}
                  </Text>
                ))}
              </Text>
            ))}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.body}>
          <Text style={styles.bodyText}>This isn't available yet. Check back soon.</Text>
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  bodyText: { fontSize: 14, color: '#888', textAlign: 'center' },
  // Bottom room so the last line scrolls clear of the chat button.
  aboutContent: { paddingHorizontal: 20, paddingBottom: 120 },
  aboutCard: {
    gap: 16,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#111',
    borderRadius: 16,
    padding: 20,
  },
  aboutHeart: { fontSize: 32 },
  aboutParagraph: { fontSize: 15, lineHeight: 22, color: '#111' },
  aboutParagraphBold: { fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
});
