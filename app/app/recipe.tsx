import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ClockIcon, MinusIcon, PlusIcon, XMarkIcon } from 'react-native-heroicons/outline';

import { IngredientRow } from '../components/IngredientRow';
import type { Meal } from '../lib/mealData';
import { resizeMealServings, servingsOptions } from '../lib/mealScaling';
import { fetchRecipeById } from '../lib/recipes';

// Recipe detail — presented as a modal over the Meals tab, opened via each
// meal card's "View recipe" button. Not covered by a wireframe yet, so this
// stays plain/functional like the rest of the guest-mode flow.
export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [rawMeal, setRawMeal] = useState<Meal | null | undefined>(undefined);
  // Manual override of the recipe's own natural serving count, via the
  // stepper below -- null means "show it as authored". Reset whenever a
  // different recipe is opened, so a stale override from a previous
  // recipe never lingers.
  const [servingsOverride, setServingsOverride] = useState<number | null>(null);

  useEffect(() => {
    if (!id) {
      setRawMeal(null);
      return;
    }
    fetchRecipeById(id)
      .then(setRawMeal)
      .catch(() => setRawMeal(null));
  }, [id]);

  useEffect(() => {
    setServingsOverride(null);
  }, [rawMeal?.id]);

  const meal =
    rawMeal && servingsOverride !== null ? resizeMealServings(rawMeal, servingsOverride) : rawMeal;
  // Whole multiples of the recipe's own natural serving count -- you
  // can't buy a fraction of a deal-tagged package, so "N+1 servings"
  // isn't a real option; making another whole batch is.
  const options = rawMeal ? servingsOptions(rawMeal.servings) : null;

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
          <View style={styles.subtitleRow}>
            <ClockIcon size={13} color="#888" />
            <Text style={styles.subtitle}>
              {meal.minutes} min · ${meal.price.toFixed(2)} / serving
            </Text>
          </View>
        </View>
        <Pressable onPress={() => router.back()}>
          <XMarkIcon size={20} color="#999" />
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

        {options && (
          <View style={styles.stepperRow}>
            <Text style={styles.stepperLabel}>Servings</Text>
            <View style={styles.stepperControl}>
              <Pressable
                style={[styles.stepperButton, meal.servings <= options[0] && styles.stepperButtonDisabled]}
                onPress={() => {
                  const i = options.indexOf(meal.servings);
                  if (i > 0) setServingsOverride(options[i - 1]);
                }}
                disabled={meal.servings <= options[0]}
                hitSlop={8}
              >
                <MinusIcon size={14} color="#111" />
              </Pressable>
              <Text style={styles.stepperValue}>{meal.servings}</Text>
              <Pressable
                style={[
                  styles.stepperButton,
                  meal.servings >= options[options.length - 1] && styles.stepperButtonDisabled,
                ]}
                onPress={() => {
                  const i = options.indexOf(meal.servings);
                  if (i >= 0 && i < options.length - 1) setServingsOverride(options[i + 1]);
                }}
                disabled={meal.servings >= options[options.length - 1]}
                hitSlop={8}
              >
                <PlusIcon size={14} color="#111" />
              </Pressable>
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>Ingredients</Text>
        <View style={styles.ingredientsList}>
          {meal.ingredients.map((ingredient, index) => (
            <IngredientRow
              key={index}
              text={ingredient.text}
              dealTag={ingredient.dealTag}
              estimatedPrice={ingredient.estimatedPrice}
            />
          ))}
        </View>

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
  title: { fontSize: 20, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  subtitle: { fontSize: 13, color: '#888' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 4 },
  macrosRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  macroPill: {
    backgroundColor: '#F2F2F2',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  macroValue: { fontSize: 16, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  macroLabel: { fontSize: 11, color: '#888' },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  stepperLabel: { fontSize: 14, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold', color: '#333' },
  stepperControl: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonDisabled: { opacity: 0.35 },
  stepperValue: { fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold', minWidth: 16, textAlign: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', marginTop: 16, marginBottom: 8 },
  ingredientsList: { gap: 10 },
  listItem: { fontSize: 15, lineHeight: 24, color: '#333' },
  notFound: { padding: 24, fontSize: 15, color: '#888' },
});
