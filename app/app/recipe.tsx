import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Meal } from '../lib/mealData';
import { fetchRecipeById } from '../lib/recipes';

// Recipe detail — presented as a modal over the Meals tab, opened via each
// meal card's "View recipe" button. Not covered by a wireframe yet, so this
// stays plain/functional like the rest of the guest-mode flow.
export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [meal, setMeal] = useState<Meal | null | undefined>(undefined);

  useEffect(() => {
    if (!id) {
      setMeal(null);
      return;
    }
    fetchRecipeById(id)
      .then(setMeal)
      .catch(() => setMeal(null));
  }, [id]);

  if (meal === undefined) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#111" />
      </View>
    );
  }

  if (!meal) {
    return (
      <View style={styles.container}>
        <Text style={styles.notFound}>Recipe not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{meal.name}</Text>
          <Text style={styles.subtitle}>
            🕐 {meal.minutes} min · ${meal.price.toFixed(2)} / serving
          </Text>
        </View>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.closeButton}>✕</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.macrosRow}>
          <View style={styles.macroPill}>
            <Text style={styles.macroValue}>{meal.calories}</Text>
            <Text style={styles.macroLabel}>kcal</Text>
          </View>
          <View style={styles.macroPill}>
            <Text style={styles.macroValue}>{meal.protein} g</Text>
            <Text style={styles.macroLabel}>protein</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Ingredients</Text>
        {meal.ingredients.map((ingredient, index) => (
          <Text key={index} style={styles.listItem}>
            •  {ingredient.text}
            {ingredient.dealTag?.quantityEstimated && (
              <Text style={styles.estimatedDisclaimer}>  *estimated. See store</Text>
            )}
          </Text>
        ))}

        <Text style={styles.sectionTitle}>Instructions</Text>
        {meal.instructions.map((step, index) => (
          <Text key={step} style={styles.listItem}>
            {index + 1}.  {step}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loadingContainer: { alignItems: 'center', justifyContent: 'center' },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
  },
  headerText: { flex: 1, marginRight: 12 },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 13, color: '#888', marginTop: 4 },
  closeButton: { fontSize: 20, color: '#999' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 4 },
  macrosRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  macroPill: {
    backgroundColor: '#F2F2F2',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  macroValue: { fontSize: 16, fontWeight: '800' },
  macroLabel: { fontSize: 11, color: '#888' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  listItem: { fontSize: 15, lineHeight: 24, color: '#333' },
  estimatedDisclaimer: { fontSize: 12, color: '#B8860B', fontStyle: 'italic' },
  notFound: { padding: 24, fontSize: 15, color: '#888' },
});
