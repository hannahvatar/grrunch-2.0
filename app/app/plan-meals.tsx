import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

// Guest-mode wireframe step 5 — Plan your meals.
//
// Three separate categories, per correction: quantity (meals + recipes are
// dependent on each other -- e.g. 12 meals as 2 recipes of 6 portions, or
// as 3 recipes of 4 portions), then the more granular per-meal nutrition
// values (calories, protein), then price as its own separate category.

function divisorsOf(n: number): number[] {
  const divisors: number[] = [];
  for (let i = 1; i <= n; i++) {
    if (n % i === 0) divisors.push(i);
  }
  return divisors;
}

const MIN_MEALS = 1;
const MAX_MEALS = 20;

export default function PlanMealsScreen() {
  const [mealCount, setMealCount] = useState(8);
  // The recipe count the user last explicitly chose. Kept separate from the
  // *displayed* recipe count (derived below) so that stepping meal count
  // through values that don't share this divisor (e.g. 8 -> 9 -> 10 -> 11)
  // doesn't permanently collapse it -- it's restored once mealCount lands
  // back on a compatible value (e.g. 12), instead of getting stuck at 1.
  const [desiredRecipeCount, setDesiredRecipeCount] = useState(4);
  const [calories, setCalories] = useState(600);
  const [protein, setProtein] = useState(30);
  const [pricePerPortion, setPricePerPortion] = useState(5);

  const validRecipeCounts = useMemo(() => divisorsOf(mealCount), [mealCount]);
  const recipeCount = validRecipeCounts.includes(desiredRecipeCount)
    ? desiredRecipeCount
    : validRecipeCounts.reduce((closest, candidate) =>
        Math.abs(candidate - desiredRecipeCount) < Math.abs(closest - desiredRecipeCount)
          ? candidate
          : closest
      );
  const portionsPerRecipe = mealCount / recipeCount;

  function changeMealCount(delta: number) {
    setMealCount((prev) => Math.max(MIN_MEALS, Math.min(MAX_MEALS, prev + delta)));
  }

  function changeRecipeCount(direction: 1 | -1) {
    const currentIndex = validRecipeCounts.indexOf(recipeCount);
    const nextIndex = Math.max(0, Math.min(validRecipeCounts.length - 1, currentIndex + direction));
    setDesiredRecipeCount(validRecipeCounts[nextIndex]);
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Plan your meals</Text>

        <Text style={styles.categoryLabel}>Quantity</Text>

        <Text style={styles.label}>NUMBER OF MEALS</Text>
        <View style={styles.stepperRow}>
          <Pressable style={styles.stepperButton} onPress={() => changeMealCount(-1)}>
            <Text style={styles.stepperButtonText}>−</Text>
          </Pressable>
          <Text style={styles.stepperValue}>
            {mealCount} meal{mealCount === 1 ? '' : 's'}
          </Text>
          <Pressable style={styles.stepperButton} onPress={() => changeMealCount(1)}>
            <Text style={styles.stepperButtonText}>+</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>NUMBER OF RECIPES</Text>
        <View style={styles.stepperRow}>
          <Pressable style={styles.stepperButton} onPress={() => changeRecipeCount(-1)}>
            <Text style={styles.stepperButtonText}>−</Text>
          </Pressable>
          <Text style={styles.stepperValue}>
            {recipeCount} recipe{recipeCount === 1 ? '' : 's'}
          </Text>
          <Pressable style={styles.stepperButton} onPress={() => changeRecipeCount(1)}>
            <Text style={styles.stepperButtonText}>+</Text>
          </Pressable>
        </View>
        <Text style={styles.derivedHint}>
          = {portionsPerRecipe} portion{portionsPerRecipe === 1 ? '' : 's'} per recipe
        </Text>

        <Text style={[styles.categoryLabel, styles.categorySpacer]}>Nutrition per meal</Text>

        <View style={styles.sliderBlock}>
          <View style={styles.sliderHeaderRow}>
            <Text style={styles.label}>CALORIES PER MEAL</Text>
            <Text style={styles.sliderValue}>{calories} kcal</Text>
          </View>
          <Slider
            minimumValue={200}
            maximumValue={1000}
            step={10}
            value={calories}
            onValueChange={setCalories}
            minimumTrackTintColor="#111"
            maximumTrackTintColor="#ddd"
          />
          <View style={styles.sliderBoundsRow}>
            <Text style={styles.sliderBoundText}>200 kcal</Text>
            <Text style={styles.sliderBoundText}>1000 kcal</Text>
          </View>
          <Text style={styles.hint}>Avg. recommended: man 700 kcal · woman 550 kcal · child 400 kcal</Text>
        </View>

        <View style={styles.sliderBlock}>
          <View style={styles.sliderHeaderRow}>
            <Text style={styles.label}>PROTEIN PER MEAL</Text>
            <Text style={styles.sliderValue}>{protein} g</Text>
          </View>
          <Slider
            minimumValue={10}
            maximumValue={80}
            step={1}
            value={protein}
            onValueChange={setProtein}
            minimumTrackTintColor="#111"
            maximumTrackTintColor="#ddd"
          />
          <View style={styles.sliderBoundsRow}>
            <Text style={styles.sliderBoundText}>10 g</Text>
            <Text style={styles.sliderBoundText}>80 g</Text>
          </View>
          <Text style={styles.hint}>Daily rec.: man 56 g · woman 46 g · child 19–34 g</Text>
        </View>

        <Text style={[styles.categoryLabel, styles.categorySpacer]}>Price</Text>

        <View style={styles.sliderBlock}>
          <View style={styles.sliderHeaderRow}>
            <Text style={styles.label}>TARGET PRICE PER PORTION</Text>
            <Text style={styles.sliderValue}>${pricePerPortion.toFixed(2)}</Text>
          </View>
          <Slider
            minimumValue={1}
            maximumValue={10}
            step={0.25}
            value={pricePerPortion}
            onValueChange={setPricePerPortion}
            minimumTrackTintColor="#111"
            maximumTrackTintColor="#ddd"
          />
          <View style={styles.sliderBoundsRow}>
            <Text style={styles.sliderBoundText}>$1.00</Text>
            <Text style={styles.sliderBoundText}>$10.00</Text>
          </View>
          <Text style={styles.hint}>Per person, per meal</Text>
        </View>

        <Text style={styles.footnote}>You can refine these targets anytime in your profile.</Text>
      </ScrollView>
      <View style={styles.footer}>
        <Pressable style={styles.primaryButton} onPress={() => router.replace('/(tabs)/meals')}>
          <Text style={styles.primaryButtonText}>Get my meals & grocery list</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 24, paddingTop: 64, gap: 8 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 8 },
  categoryLabel: { fontSize: 15, fontWeight: '800' },
  categorySpacer: { marginTop: 16 },
  label: { fontSize: 12, fontWeight: '700', color: '#888', letterSpacing: 0.5, marginTop: 12 },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  stepperButton: { padding: 8 },
  stepperButtonText: { fontSize: 22, fontWeight: '700' },
  stepperValue: { fontSize: 18, fontWeight: '700' },
  derivedHint: { fontSize: 13, color: '#666', marginTop: 6 },
  sliderBlock: { marginTop: 12 },
  sliderHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sliderValue: { fontSize: 20, fontWeight: '800' },
  sliderBoundsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderBoundText: { fontSize: 12, color: '#999' },
  hint: { fontSize: 13, color: '#666', marginTop: 4 },
  footnote: { fontSize: 13, color: '#999', marginTop: 16 },
  footer: { padding: 24, borderTopWidth: 1, borderTopColor: '#eee' },
  primaryButton: {
    backgroundColor: '#111',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
