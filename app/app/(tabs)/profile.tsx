import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

// Not yet detailed in the wireframes beyond this — placeholder tab, but the
// grocery list needs to be reachable from here too (not just from Meals).
export default function ProfileScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>

      <Pressable style={styles.row} onPress={() => router.push('/grocery-list')}>
        <Text style={styles.rowIcon}>🧺</Text>
        <Text style={styles.rowLabel}>Grocery list</Text>
        <Text style={styles.rowChevron}>›</Text>
      </Pressable>

      <Text style={styles.body}>Everything else here isn't yet detailed in the wireframes.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 64, gap: 16 },
  title: { fontSize: 24, fontWeight: '800' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  rowIcon: { fontSize: 18 },
  rowLabel: { flex: 1, fontSize: 16, fontWeight: '600' },
  rowChevron: { fontSize: 18, color: '#999' },
  body: { fontSize: 14, color: '#888' },
});
