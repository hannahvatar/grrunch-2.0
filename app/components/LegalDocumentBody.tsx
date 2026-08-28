import { StyleSheet, Text, View } from 'react-native';

import { LegalSection } from '../lib/legalContent';

const INK = '#111';

// Same section/bullet rendering as LegalDocumentModal.tsx's ScrollView
// content, extracted so Settings > Privacy/Legal (their own full pages,
// not a centered modal card -- Anabelle, 2026-08-28) can reuse the exact
// same real Privacy Policy/Terms of Use content without duplicating the
// render logic. LegalDocumentModal itself stays untouched -- the
// first-run consent flow (index.tsx) keeps working exactly as before.
export function LegalDocumentBody({
  effectiveDate,
  intro,
  sections,
  outro,
}: {
  effectiveDate: string;
  intro: string;
  sections: LegalSection[];
  outro?: string;
}) {
  return (
    <>
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
    </>
  );
}

const styles = StyleSheet.create({
  effectiveDate: { fontSize: 13, color: '#767676' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  paragraph: { fontSize: 14, lineHeight: 21, color: INK },
  bulletList: { gap: 4 },
  bulletRow: { flexDirection: 'row', gap: 8 },
  bulletDot: { fontSize: 14, color: INK, lineHeight: 21 },
  bulletText: { flex: 1, fontSize: 14, lineHeight: 21, color: INK },
});
