import { StyleSheet, Text, View } from 'react-native';

const INK = '#111';

// Friday "new deals are coming" state for Meals and Weekly Deals, shown
// between the Thursday 11:59 pm close and the Saturday 12:00 am publish
// (lib/liveWeek.ts, Anabelle 2026-09-24).
//
// PLACEHOLDER -- Anabelle wants this "exciting" and is providing the
// design instructions; this only holds the slot so the timing can be
// built and tested first.
export function WeekGapState({ screen }: { screen: 'meals' | 'deals' }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>New {screen === 'meals' ? 'recipes' : 'deals'} drop Saturday</Text>
      <Text style={styles.body}>This week’s flyers are in. Check back Saturday at 12:00 am.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  title: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, color: INK, textAlign: 'center' },
});
