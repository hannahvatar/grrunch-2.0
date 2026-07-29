import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Meal } from '../../lib/mealData';
import { fetchRecipesByIds } from '../../lib/recipes';
import { useSavedRecipes } from '../../lib/savedRecipes';

// Not yet detailed in the wireframes beyond Saved recipes — placeholder tab.
// Grocery list access lives in its own tab (app/(tabs)/grocery.tsx).
export default function ProfileScreen() {
  const { savedIds, toggleSaved } = useSavedRecipes();
  const [savedMeals, setSavedMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecipesByIds(Array.from(savedIds))
      .then(setSavedMeals)
      .catch(() => setSavedMeals([]))
      .finally(() => setLoading(false));
  }, [savedIds]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Profile</Text>
        {/* No settings screen yet -- account settings will nest under here later. */}
        <Pressable hitSlop={8}>
          <Text style={styles.gearIcon}>⚙️</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Saved recipes</Text>
      {loading ? (
        <ActivityIndicator size="small" color="#111" style={styles.loadingIndicator} />
      ) : savedMeals.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            No saved recipes yet — tap the ♡ on a meal in your plan to save it here.
          </Text>
        </View>
      ) : (
        savedMeals.map((meal) => (
          <View key={meal.id} style={styles.savedCard}>
            <Pressable onPress={() => toggleSaved(meal.id)} hitSlop={8}>
              <Text style={styles.savedHeart}>❤️</Text>
            </Pressable>
            <Pressable
              style={styles.savedInfo}
              onPress={() => router.push({ pathname: '/recipe', params: { id: meal.id } })}
            >
              <Text style={styles.savedName}>{meal.name}</Text>
              <Text style={styles.savedMeta}>
                ${meal.price.toFixed(2)} / portion · {meal.minutes} min
              </Text>
            </Pressable>
          </View>
        ))
      )}

      <Text style={styles.body}>Everything else here isn't yet detailed in the wireframes.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, gap: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800' },
  gearIcon: { fontSize: 22 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  loadingIndicator: { marginTop: 8 },
  emptyState: { backgroundColor: '#F2F2F2', borderRadius: 14, padding: 16 },
  emptyStateText: { color: '#666', fontSize: 14 },
  savedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  savedHeart: { fontSize: 18 },
  savedInfo: { flex: 1 },
  savedName: { fontSize: 15, fontWeight: '700' },
  savedMeta: { fontSize: 13, color: '#888', marginTop: 2 },
  body: { fontSize: 14, color: '#888', marginTop: 8 },
});
