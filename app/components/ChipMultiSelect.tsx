import { Pressable, StyleSheet, Text, View } from 'react-native';

const INK = '#111';

interface ChipMultiSelectProps {
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
}

// Same pill visual language as SegmentedControl.tsx (INK border, INK fill
// when selected), but for a "choose any number" field instead of "choose
// exactly one" -- built for ManageAccountSection.tsx's new "Grrunch
// preferences" (Anabelle, 2026-09-15: Preferred stores/Dietary
// preferences, both genuinely multi-select, not exclusive choices).
// flexWrap'd onto multiple rows rather than SegmentedControl's horizontal
// ScrollView -- these option lists (5 chains, 8 diet tags) read better
// as a wrapped grid than a single scrollable row.
export function ChipMultiSelect({ options, values, onChange }: ChipMultiSelectProps) {
  function toggle(option: string) {
    onChange(values.includes(option) ? values.filter((v) => v !== option) : [...values, option]);
  }

  return (
    <View style={styles.row}>
      {options.map((option) => {
        const selected = values.includes(option);
        return (
          <Pressable
            key={option}
            style={[styles.pill, selected && styles.pillSelected]}
            onPress={() => toggle(option)}
          >
            <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: INK,
    backgroundColor: '#fff',
  },
  pillSelected: { backgroundColor: INK },
  pillText: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  pillTextSelected: { color: '#fff' },
});
