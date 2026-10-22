import { Pressable, StyleSheet, Text } from 'react-native';
import { ArrowRightIcon } from 'react-native-heroicons/outline';

const INK = '#111';

// The text-plus-arrow link used across the first-run flow ("Continue as
// guest ->", "Skip for now ->"): semibold ink label, 16px arrow, 8px gap.
// Same look as login.tsx's guestButton/guestText and location.tsx's
// skipButton/skipText.
export function ArrowLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress} hitSlop={12}>
      <Text style={styles.text}>{label}</Text>
      <ArrowRightIcon size={16} color={INK} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { fontSize: 16, color: INK, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold' },
});
