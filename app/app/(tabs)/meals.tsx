import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MEALS } from '../../lib/mealData';

// Guest-mode wireframe step 6 — Main App, Meals tab.
// recipeCount/portionsPerRecipe come from Plan your meals (the Quantity
// section) via router params -- they're just the starting point here, since
// swap/delete/portions edits below make this screen's own state the source
// of truth afterward. Falls back to sane defaults if reached without them
// (e.g. hot reload, or a direct link). Clamped to MEALS.length since the
// sample pool only has 8 entries -- real generation isn't wired up yet.
function randomAvailableMealId(currentIds: string[]): string | undefined {
  const available = MEALS.filter((m) => !currentIds.includes(m.id));
  if (available.length === 0) return undefined;
  return available[Math.floor(Math.random() * available.length)].id;
}

export default function MealsScreen() {
  const params = useLocalSearchParams<{ recipeCount?: string; portionsPerRecipe?: string }>();

  const [planMealIds, setPlanMealIds] = useState<string[]>(() => {
    const parsed = Number(params.recipeCount);
    const recipeCount = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, MEALS.length) : 4;
    return MEALS.slice(0, recipeCount).map((m) => m.id);
  });
  const [portionsById, setPortionsById] = useState<Record<string, number>>(() => {
    const parsedPortions = Number(params.portionsPerRecipe);
    const defaultPortions = Number.isFinite(parsedPortions) && parsedPortions > 0 ? parsedPortions : 1;
    return Object.fromEntries(planMealIds.map((id) => [id, defaultPortions]));
  });

  const planMeals = planMealIds
    .map((id) => MEALS.find((m) => m.id === id))
    .filter((m): m is (typeof MEALS)[number] => m !== undefined);

  const totalPortions = planMeals.reduce((sum, meal) => sum + (portionsById[meal.id] ?? 1), 0);
  const totalPrice = planMeals.reduce(
    (sum, meal) => sum + meal.price * (portionsById[meal.id] ?? 1),
    0
  );
  const avgPerPortion = totalPortions > 0 ? totalPrice / totalPortions : 0;

  function setPortions(id: string, delta: number) {
    setPortionsById((prev) => ({
      ...prev,
      [id]: Math.max(1, (prev[id] ?? 1) + delta),
    }));
  }

  function swapMeal(id: string) {
    const replacementId = randomAvailableMealId(planMealIds);
    if (!replacementId) return;
    setPlanMealIds((prev) => prev.map((mealId) => (mealId === id ? replacementId : mealId)));
    setPortionsById((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return { ...rest, [replacementId]: 1 };
    });
  }

  function deleteMeal(id: string) {
    setPlanMealIds((prev) => prev.filter((mealId) => mealId !== id));
    setPortionsById((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.guestBanner}>
          <Text style={styles.guestBannerText}>Browsing as guest</Text>
          <Text style={styles.signUpLink}>Sign up</Text>
        </View>

        <Text style={styles.title}>Your meal plan</Text>
        <Text style={styles.subtitle}>
          {planMeals.length} recipe{planMeals.length === 1 ? '' : 's'} · {totalPortions} meal
          {totalPortions === 1 ? '' : 's'} total
        </Text>

        {planMeals.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No meals left in your plan. Delete was a bit too enthusiastic — swap or start over.
            </Text>
          </View>
        )}

        {planMeals.map((meal) => {
          const portions = portionsById[meal.id] ?? 1;
          return (
            <View key={meal.id} style={styles.mealCard}>
              <View style={styles.mealImagePlaceholder}>
                <Text style={styles.mealImageIcon}>🍴</Text>
              </View>
              <View style={styles.mealCardBody}>
                <View style={styles.mealHeaderRow}>
                  <Text style={styles.mealName}>{meal.name}</Text>
                  <View style={styles.priceBlock}>
                    <Text style={styles.mealPrice}>${meal.price.toFixed(2)}</Text>
                    <Text style={styles.perPortion}>/ portion</Text>
                  </View>
                </View>
                <Text style={styles.mealTime}>🕐 {meal.minutes} min</Text>
                <View style={styles.tagPill}>
                  <Text style={styles.tagText}>🏷️ {meal.tag}</Text>
                </View>

                <View style={styles.portionsRow}>
                  <Text style={styles.portionsLabel}>Portions</Text>
                  <View style={styles.stepper}>
                    <Pressable
                      style={styles.stepperButton}
                      onPress={() => setPortions(meal.id, -1)}
                    >
                      <Text style={styles.stepperButtonText}>−</Text>
                    </Pressable>
                    <Text style={styles.stepperValue}>{portions}</Text>
                    <Pressable style={styles.stepperButton} onPress={() => setPortions(meal.id, 1)}>
                      <Text style={styles.stepperButtonText}>+</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.actionsRow}>
                  <Pressable style={styles.actionButton} onPress={() => swapMeal(meal.id)}>
                    <Text style={styles.actionButtonText}>🔄 Swap</Text>
                  </Pressable>
                  <Pressable style={styles.actionButton} onPress={() => deleteMeal(meal.id)}>
                    <Text style={styles.actionButtonText}>🗑 Delete</Text>
                  </Pressable>
                </View>

                <Pressable
                  style={styles.recipeButton}
                  onPress={() => router.push({ pathname: '/recipe', params: { id: meal.id } })}
                >
                  <Text style={styles.recipeButtonText}>View recipe</Text>
                </Pressable>
              </View>
            </View>
          );
        })}

        {planMeals.length > 0 && (
          <View style={styles.totalCard}>
            <View>
              <Text style={styles.totalLabel}>
                Total · {totalPortions} meal{totalPortions === 1 ? '' : 's'}
              </Text>
              <Text style={styles.totalSublabel}>avg. ${avgPerPortion.toFixed(2)} / portion</Text>
            </View>
            <Text style={styles.totalValue}>${totalPrice.toFixed(2)}</Text>
          </View>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable style={styles.groceryButton} onPress={() => router.push('/grocery-list')}>
          <Text style={styles.groceryButtonText}>🧺  View grocery list</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60, gap: 16 },
  guestBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F2F2F2',
    borderRadius: 12,
    padding: 14,
  },
  guestBannerText: { color: '#666' },
  signUpLink: { fontWeight: '700', textDecorationLine: 'underline' },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 13, color: '#888', marginTop: -8 },
  emptyState: { backgroundColor: '#F2F2F2', borderRadius: 14, padding: 20 },
  emptyStateText: { color: '#666', fontSize: 14, textAlign: 'center' },
  mealCard: { borderWidth: 1, borderColor: '#eee', borderRadius: 14, overflow: 'hidden' },
  mealImagePlaceholder: {
    height: 100,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealImageIcon: { fontSize: 28, opacity: 0.4 },
  mealCardBody: { padding: 14, gap: 8 },
  mealHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  mealName: { fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8 },
  priceBlock: { alignItems: 'flex-end' },
  mealPrice: { fontSize: 17, fontWeight: '800' },
  perPortion: { fontSize: 11, color: '#999' },
  mealTime: { fontSize: 13, color: '#888' },
  tagPill: { backgroundColor: '#EEF4FF', borderRadius: 10, padding: 10 },
  tagText: { color: '#2C5FD6', fontSize: 13, fontWeight: '600' },
  portionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 8,
  },
  portionsLabel: { fontSize: 14, color: '#666', fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { fontSize: 16, fontWeight: '700' },
  stepperValue: { fontSize: 15, fontWeight: '700', minWidth: 16, textAlign: 'center' },
  actionsRow: { flexDirection: 'row', gap: 8 },
  actionButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionButtonText: { fontSize: 14, fontWeight: '700' },
  recipeButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  recipeButtonText: { fontSize: 14, fontWeight: '700' },
  totalCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 14,
    padding: 16,
  },
  totalLabel: { fontSize: 16, fontWeight: '700' },
  totalSublabel: { fontSize: 13, color: '#888' },
  totalValue: { fontSize: 24, fontWeight: '800' },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: '#eee' },
  groceryButton: {
    backgroundColor: '#111',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  groceryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
