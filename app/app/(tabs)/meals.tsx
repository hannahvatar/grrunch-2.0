import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Meal } from '../../lib/mealData';
import { fetchAllRecipes } from '../../lib/recipes';
import { useSavedRecipes } from '../../lib/savedRecipes';
import { useSelectedMeals } from '../../lib/selectedMeals';

// Guest-mode wireframe step 6 — Main App, Meals tab.
// A recipe's servings are a real, fixed property (however many servings its
// ingredients actually yield as sold -- not a number the user picks), so
// there's no "servings per recipe" to derive or edit here anymore. This
// screen shows every real recipe matching the calorie/protein/price targets
// from Plan your meals; the user checks off which ones they actually want
// and adds them to their grocery list.
interface PlanTargets {
  maxCalories?: string;
  minProtein?: string;
  maxPrice?: string;
}

// Meal Plan Engine is a pure query against the recipe library -- never a
// live AI call -- so filtering to targets can legitimately come back with
// fewer matches than requested. That's an intentional tradeoff (see
// architecture.md), not a bug: a thinner plan beats silently ignoring the
// user's calorie/protein/price targets.
function eligibleMeals(allMeals: Meal[], targets: PlanTargets = {}): Meal[] {
  const maxCalories = Number(targets.maxCalories);
  const minProtein = Number(targets.minProtein);
  const maxPrice = Number(targets.maxPrice);

  return allMeals.filter((m) => {
    if (Number.isFinite(maxCalories) && m.calories > maxCalories) return false;
    if (Number.isFinite(minProtein) && m.protein < minProtein) return false;
    if (Number.isFinite(maxPrice) && m.price > maxPrice) return false;
    return true;
  });
}

function planIdsFromParams(allMeals: Meal[], targets: PlanTargets = {}): string[] {
  return eligibleMeals(allMeals, targets).map((m) => m.id);
}

export default function MealsScreen() {
  const params = useLocalSearchParams<{
    maxCalories?: string;
    minProtein?: string;
    maxPrice?: string;
  }>();
  const { savedIds, toggleSaved } = useSavedRecipes();
  const { selectedIds, toggleSelected } = useSelectedMeals();

  const [allMeals, setAllMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [planMealIds, setPlanMealIds] = useState<string[]>([]);

  useEffect(() => {
    fetchAllRecipes()
      .then((meals) => {
        setAllMeals(meals);
        setPlanMealIds(
          planIdsFromParams(meals, {
            maxCalories: params.maxCalories,
            minProtein: params.minProtein,
            maxPrice: params.maxPrice,
          })
        );
      })
      .catch(() => {
        router.replace({
          pathname: '/error',
          params: { body: "We couldn't load your meals. Please try again." },
        });
      })
      .finally(() => setLoading(false));
    // Only ever runs once on mount -- the plan-reapply effect below handles
    // subsequent param changes without re-fetching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tab screens stay mounted when you switch tabs (they don't remount), so
  // if this screen was ever visited before "Get my meals" was pressed, the
  // useState initializer above already ran against stale params and won't
  // re-run on its own. This effect re-applies the plan whenever the targets
  // actually change, so pressing the button always takes effect even if the
  // tab was mounted earlier.
  useEffect(() => {
    if (allMeals.length === 0) return;
    if (!params.maxCalories && !params.minProtein && !params.maxPrice) return;
    setPlanMealIds(
      planIdsFromParams(allMeals, {
        maxCalories: params.maxCalories,
        minProtein: params.minProtein,
        maxPrice: params.maxPrice,
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMeals, params.maxCalories, params.minProtein, params.maxPrice]);

  const planMeals = planMealIds
    .map((id) => allMeals.find((m) => m.id === id))
    .filter((m): m is Meal => m !== undefined);

  const totalServings = planMeals.reduce((sum, meal) => sum + meal.servings, 0);
  const totalPrice = planMeals.reduce((sum, meal) => sum + meal.price * meal.servings, 0);
  const avgPerServing = totalServings > 0 ? totalPrice / totalServings : 0;

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#111" />
      </View>
    );
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
          {planMeals.length} recipe{planMeals.length === 1 ? '' : 's'} · {totalServings} serving
          {totalServings === 1 ? '' : 's'} total
        </Text>

        {planMeals.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No meals left in your plan. Try loosening your calorie, protein, or price targets, or
              start over.
            </Text>
          </View>
        )}

        {planMeals.map((meal) => (
          <View key={meal.id} style={styles.mealCard}>
            <View style={styles.mealImagePlaceholder}>
              <Text style={styles.mealImageIcon}>🍴</Text>
              <Pressable style={styles.saveButton} onPress={() => toggleSaved(meal.id)} hitSlop={8}>
                <Text style={styles.saveButtonIcon}>{savedIds.has(meal.id) ? '❤️' : '🤍'}</Text>
              </Pressable>
            </View>
            <View style={styles.mealCardBody}>
              <View style={styles.mealHeaderRow}>
                <Text style={styles.mealName}>{meal.name}</Text>
                <View style={styles.priceBlock}>
                  <Text style={styles.mealPrice}>${meal.price.toFixed(2)}</Text>
                  <Text style={styles.perServing}>/ serving</Text>
                </View>
              </View>
              <Text style={styles.mealTime}>
                🕐 {meal.minutes} min · makes {meal.servings} serving{meal.servings === 1 ? '' : 's'}
              </Text>
              {meal.dealTags.length > 0 && (
                <View style={styles.dealTagsRow}>
                  {meal.dealTags.map((dealTag) => (
                    <View key={dealTag.name} style={styles.dealTagPill}>
                      <Text style={styles.dealTagName} numberOfLines={1}>
                        🏷️ {dealTag.name}
                      </Text>
                      <View style={styles.dealTagBadge}>
                        <Text style={styles.dealTagBadgeText}>-{dealTag.discountPct}%</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <Pressable style={styles.selectRow} onPress={() => toggleSelected(meal.id)}>
                <View style={[styles.checkbox, selectedIds.has(meal.id) && styles.checkboxChecked]}>
                  {selectedIds.has(meal.id) && <Text style={styles.checkboxMark}>✓</Text>}
                </View>
                <Text style={styles.selectRowText}>
                  {selectedIds.has(meal.id) ? 'Added to grocery list' : 'Add to grocery list'}
                </Text>
              </Pressable>

              <Pressable
                style={styles.recipeButton}
                onPress={() => router.push({ pathname: '/recipe', params: { id: meal.id } })}
              >
                <Text style={styles.recipeButtonText}>View recipe</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {planMeals.length > 0 && (
          <View style={styles.totalCard}>
            <View>
              <Text style={styles.totalLabel}>
                Total · {totalServings} serving{totalServings === 1 ? '' : 's'}
              </Text>
              <Text style={styles.totalSublabel}>avg. ${avgPerServing.toFixed(2)} / serving</Text>
            </View>
            <Text style={styles.totalValue}>${totalPrice.toFixed(2)}</Text>
          </View>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          style={[styles.groceryButton, selectedIds.size === 0 && styles.groceryButtonDisabled]}
          disabled={selectedIds.size === 0}
          onPress={() => router.push('/(tabs)/grocery')}
        >
          <Text style={styles.groceryButtonText}>🧺  Add to my grocery list</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { alignItems: 'center', justifyContent: 'center' },
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
  saveButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffffcc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonIcon: { fontSize: 16 },
  mealCardBody: { padding: 14, gap: 8 },
  mealHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  mealName: { fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8 },
  priceBlock: { alignItems: 'flex-end' },
  mealPrice: { fontSize: 17, fontWeight: '800' },
  perServing: { fontSize: 11, color: '#999' },
  mealTime: { fontSize: 13, color: '#888' },
  dealTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dealTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF4FF',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 6,
    maxWidth: '100%',
  },
  dealTagName: { color: '#2C5FD6', fontSize: 12, fontWeight: '600', flexShrink: 1 },
  dealTagBadge: { backgroundColor: '#2C5FD6', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  dealTagBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  selectRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#111', borderColor: '#111' },
  checkboxMark: { fontSize: 12, fontWeight: '700', color: '#fff' },
  selectRowText: { fontSize: 14, fontWeight: '600' },
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
  groceryButtonDisabled: { backgroundColor: '#ccc' },
  groceryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
