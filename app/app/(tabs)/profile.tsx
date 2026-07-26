import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

// Not yet detailed in the wireframes beyond this — placeholder tab, but the
// grocery list needs to be reachable from here too (not just from Meals).
// Prominent standalone button, not a nested list row.
export default function ProfileScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>

      <Pressable style={styles.groceryButton} onPress={() => router.push('/grocery-list')}>
        <Text style={styles.groceryButtonText}>🧺  View grocery list</Text>
      </Pressable>

      <Text style={styles.body}>Everything else here isn't yet detailed in the wireframes.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 64, gap: 16 },
  title: { fontSize: 24, fontWeight: '800' },
  groceryButton: {
    backgroundColor: '#111',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  groceryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  body: { fontSize: 14, color: '#888' },
});
