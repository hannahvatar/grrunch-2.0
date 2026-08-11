import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const INK = '#111';

interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
}

// A row of pill buttons, one selected at a time -- the app has no
// native Switch or picker/select anywhere (checked before building
// this), so this is a fresh shared primitive for that shape, matching
// InputField.tsx's flat/pill/#111-border visual language rather than
// introducing a new dependency (@react-native-picker) or a native
// Switch that wouldn't match the rest of the design system.
// ScrollView'd horizontally since a 5-option row (price_unit) doesn't
// reliably fit a phone-width screen at a legible tap-target size.
export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
      <View style={styles.row}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              style={[styles.pill, selected && styles.pillSelected]}
              onPress={() => onChange(option.value)}
            >
              <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { flexDirection: 'row', gap: 8 },
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
