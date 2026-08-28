import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckIcon } from 'react-native-heroicons/solid';

const INK = '#111';

// One category row (title + description + checkbox) -- shared between
// notifications-push.tsx and notifications-email.tsx so the two lists
// stay visually identical (Anabelle's reference screenshot, 2026-08-28).
export function CategoryToggleRow({
  title,
  description,
  checked,
  onToggle,
  disabled,
}: {
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable style={[styles.row, disabled && styles.rowDisabled]} onPress={onToggle} disabled={disabled} hitSlop={4}>
      <View style={styles.textBlock}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <View style={[styles.checkbox, checked && !disabled && styles.checkboxChecked]}>
        {checked && !disabled && <CheckIcon size={16} color="#fff" />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  rowDisabled: { opacity: 0.4 },
  textBlock: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  description: { fontSize: 13, color: '#767676', marginTop: 3, lineHeight: 18 },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: INK,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: { backgroundColor: INK },
});
