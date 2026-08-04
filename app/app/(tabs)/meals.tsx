import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CakeIcon, CheckIcon, ClockIcon, HeartIcon, LockClosedIcon, TagIcon } from 'react-native-heroicons/outline';
import { HeartIcon as HeartIconSolid } from 'react-native-heroicons/solid';

import { AccountBanner } from '../../components/AccountBanner';
import { MIN_DISPLAYED_DISCOUNT_PCT } from '../../lib/curatedDeals';
import type { Meal } from '../../lib/mealData';
import { scaleMealToTargets } from '../../lib/mealScaling';
import { type PlanTargets, usePlanTargets } from '../../lib/planTargets';
import { fetchAllRecipes } from '../../lib/recipes';
import { useSavedRecipes } from '../../lib/savedRecipes';
import { useSelectedMeals } from '../../lib/selectedMeals';
import { useSubscription } from '../../lib/subscription';

// Free tier sees only the first 3 meal recommendations -- Grrunch Plus
// (30-day free trial, then $5.99/mo) unlocks the rest. A single "Unlock N
// more recipes" tile stands in for however many are left, naming the real
// count rather than a generic upsell.
const FREE_MEAL_LIMIT = 3;

// Guest-mode wireframe step 6 — Main App, Meals tab.
// A recipe's ingredients (and its deal-tagged anchor package) are fixed for
// the whole batch, so there's no "servings per recipe" to arbitrarily pick.
// What the Plan tab's calorie/protein targets actually choose is how many
// equal servings that batch is divided into (see lib/mealScaling.ts) --
// this screen shows every recipe for which some such split exists.
//
// Meal Plan Engine is a pure query against the recipe library -- never a
// live AI call -- so filtering to targets can legitimately come back with
// fewer matches than requested. That's an intentional tradeoff (see
// architecture.md), not a bug: a thinner plan beats silently ignoring the
// user's calorie/protein targets.
//
// Recipes are persistent and reused week to week, but their deal_tags are
// re-matched against each new week's curated_deals -- a recipe with none
// of its ingredients currently on sale stops surfacing here entirely
// (rather than showing at regular price) until one of them is on sale
// again, since the app's whole value prop is deal-driven meal planning.
function eligibleMeals(allMeals: Meal[], targets: PlanTargets): Meal[] {
  return allMeals
    .filter((m) => m.dealTags.length > 0)
    .map((m) => scaleMealToTargets(m, targets))
    .filter((m): m is Meal => m !== null);
}

export default function MealsScreen() {
  const { targets } = usePlanTargets();
  const { savedIds, toggleSaved } = useSavedRecipes();
  const { selectedIds, toggleSelected } = useSelectedMeals();
  const { isSubscribed } = useSubscription();

  const [allMeals, setAllMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);

  function handleToggleSaved(mealId: string) {
    if (!isSubscribed) {
      router.push({ pathname: '/upgrade', params: { reason: 'save recipes' } });
      return;
    }
    toggleSaved(mealId);
  }

  useEffect(() => {
    fetchAllRecipes()
      .then(setAllMeals)
      .catch(() => {
        router.replace({
          pathname: '/error',
          params: { body: "We couldn't load your meals. Please try again." },
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const planMeals = eligibleMeals(allMeals, targets);
  const visibleMeals = isSubscribed ? planMeals : planMeals.slice(0, FREE_MEAL_LIMIT);
  const lockedMealCount = planMeals.length - visibleMeals.length;

  const totalServings = visibleMeals.reduce((sum, meal) => sum + meal.servings, 0);
  const totalPrice = visibleMeals.reduce((sum, meal) => sum + meal.price * meal.servings, 0);
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
        <AccountBanner />

        <Text style={styles.title}>Your meal plan</Text>
        <Text style={styles.subtitle}>
          {visibleMeals.length} recipe{visibleMeals.length === 1 ? '' : 's'} · {totalServings} serving
          {totalServings === 1 ? '' : 's'} total
        </Text>

        {planMeals.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No meals left in your plan. Try loosening your calorie or protein targets, or
              start over.
            </Text>
          </View>
        )}

        {visibleMeals.map((meal) => (
          <View key={meal.id} style={styles.mealCard}>
            <View style={styles.mealImagePlaceholder}>
              <CakeIcon size={28} color="#ccc" />
              {selectedIds.has(meal.id) && (
                <View style={styles.groceryConfirmBadge}>
                  <CheckIcon size={12} color="#fff" />
                  <Text style={styles.groceryConfirmBadgeText}>Added</Text>
                </View>
              )}
              <Pressable style={styles.saveButton} onPress={() => handleToggleSaved(meal.id)} hitSlop={8}>
                {savedIds.has(meal.id) ? (
                  <HeartIconSolid size={16} color="#e0245e" />
                ) : (
                  <HeartIcon size={16} color="#111" />
                )}
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
              <View style={styles.mealTimeRow}>
                <ClockIcon size={13} color="#888" />
                <Text style={styles.mealTime}>
                  {meal.minutes} min · makes {meal.servings} serving{meal.servings === 1 ? '' : 's'}
                </Text>
              </View>
              {meal.dealTags.length > 0 && (
                <View style={styles.dealTagsRow}>
                  {meal.dealTags.map((dealTag) => (
                    <View key={dealTag.name} style={styles.dealTagPill}>
                      <TagIcon size={12} color="#2C5FD6" />
                      <Text style={styles.dealTagName} numberOfLines={1}>
                        {dealTag.name}
                      </Text>
                      {dealTag.discountPct >= MIN_DISPLAYED_DISCOUNT_PCT ? (
                        <View style={styles.dealTagBadge}>
                          <Text style={styles.dealTagBadgeText}>Up to {dealTag.discountPct}% off</Text>
                        </View>
                      ) : (
                        <View style={styles.fairPriceBadge}>
                          <Text style={styles.dealTagBadgeText}>Fair price</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}

              <Pressable
                style={[
                  styles.groceryToggleButton,
                  selectedIds.has(meal.id) && styles.groceryToggleButtonActive,
                ]}
                onPress={() => toggleSelected(meal.id)}
              >
                <Text
                  style={[
                    styles.groceryToggleButtonText,
                    selectedIds.has(meal.id) && styles.groceryToggleButtonTextActive,
                  ]}
                >
                  {selectedIds.has(meal.id) ? 'Remove from my grocery list' : 'Add to my grocery list'}
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

        {lockedMealCount > 0 && (
          <Pressable
            style={styles.unlockCard}
            onPress={() =>
              router.push({
                pathname: '/upgrade',
                params: { reason: `see ${lockedMealCount} more matching meal${lockedMealCount === 1 ? '' : 's'}` },
              })
            }
          >
            <LockClosedIcon size={22} color="#111" />
            <Text style={styles.unlockTitle}>
              Unlock {lockedMealCount} more recipe{lockedMealCount === 1 ? '' : 's'}
            </Text>
            <Text style={styles.unlockSubtitle}>Start your 30-day free trial · Then $5.99/mo</Text>
          </Pressable>
        )}

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 20, paddingTop: 60, gap: 16 },
  title: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  subtitle: { fontSize: 13, color: '#888', marginTop: -8 },
  emptyState: { backgroundColor: '#F2F2F2', borderRadius: 14, padding: 20 },
  emptyStateText: { color: '#666', fontSize: 14, textAlign: 'center' },
  mealCard: { borderWidth: 1, borderColor: '#eee', borderRadius: 14, overflow: 'hidden' },
  unlockCard: {
    borderWidth: 1,
    borderColor: '#111',
    borderRadius: 14,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 4,
  },
  unlockTitle: { fontSize: 16, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', textAlign: 'center' },
  unlockSubtitle: { fontSize: 13, color: '#888', textAlign: 'center' },
  mealImagePlaceholder: {
    height: 100,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  groceryConfirmBadge: {
    position: 'absolute',
    top: 8,
    right: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1E9E5A',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  groceryConfirmBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  mealCardBody: { padding: 14, gap: 8 },
  mealHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  mealName: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', flex: 1, marginRight: 8 },
  priceBlock: { alignItems: 'flex-end' },
  mealPrice: { fontSize: 17, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  perServing: { fontSize: 11, color: '#999' },
  mealTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
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
  dealTagName: { color: '#2C5FD6', fontSize: 12, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold', flexShrink: 1 },
  dealTagBadge: { backgroundColor: '#2C5FD6', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  dealTagBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  fairPriceBadge: { backgroundColor: '#E8B800', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  groceryToggleButton: {
    borderWidth: 1,
    borderColor: '#111',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  groceryToggleButtonActive: { backgroundColor: '#111' },
  groceryToggleButtonText: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: '#111' },
  groceryToggleButtonTextActive: { color: '#fff' },
  recipeButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  recipeButtonText: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  totalCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 14,
    padding: 16,
  },
  totalLabel: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  totalSublabel: { fontSize: 13, color: '#888' },
  totalValue: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
});
