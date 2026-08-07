import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CakeIcon, CheckIcon, HeartIcon, LightBulbIcon, LockClosedIcon } from 'react-native-heroicons/outline';
import { HeartIcon as HeartIconSolid } from 'react-native-heroicons/solid';

import { AccountBanner } from '../../components/AccountBanner';
import { AvocadoBeanIcon, RestaurantIcon } from '../../components/MaterialSymbols';
import { MIN_DISPLAYED_DISCOUNT_PCT } from '../../lib/curatedDeals';
import type { Meal } from '../../lib/mealData';
import { scaleMealToTargets } from '../../lib/mealScaling';
import { type PlanTargets, usePlanTargets } from '../../lib/planTargets';
import { getRecipeImage } from '../../lib/recipeImages';
import { fetchAllRecipes } from '../../lib/recipes';
import { useSavedRecipes } from '../../lib/savedRecipes';
import { useSelectedMeals } from '../../lib/selectedMeals';
import { useSubscription } from '../../lib/subscription';

// GRRUNCH DS -- matches login.tsx/index.tsx/location.tsx/stores.tsx/plan-meals.tsx's palette.
const ACCENT = '#FFA955';
const INK = '#111';

// Free tier sees only the first 3 meal recommendations -- Grrunch Plus
// (30-day free trial, then $5.99/mo) unlocks the rest. A single "Unlock N
// more recipes" tile stands in for however many are left, naming the real
// count rather than a generic upsell.
const FREE_MEAL_LIMIT = 3;

// Flyer-sourced deal names come through however the store printed them
// (often ALL CAPS, e.g. "NO NAME® NATURALLY IMPERFECT™ SWEET PEPPERS") --
// title-cased for display only, so matching against the raw name elsewhere
// (grocery list, deal attribution) is unaffected.
function toTitleCase(text: string): string {
  return text.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

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
      <View style={[styles.gradient, styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={INK} />
      </View>
    );
  }

  return (
    <View style={[styles.gradient, styles.container]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <AccountBanner />

        <Text style={styles.title}>Meals from This Week's Deals</Text>
        <View style={styles.subtitleRow}>
          <Text style={styles.subtitle}>
            {visibleMeals.length} recipe{visibleMeals.length === 1 ? '' : 's'}
          </Text>
          <View style={styles.tipPill}>
            <LightBulbIcon size={20} color={INK} strokeWidth={2} />
            <Text style={styles.tip}>
              Want more results? Adjust your{' '}
              <Text style={styles.tipLink} onPress={() => router.push('/(tabs)/plan-meals')}>
                meal settings
              </Text>
              .
            </Text>
          </View>
        </View>

        {planMeals.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No meals left in your plan. Try loosening your calorie or protein targets, or
              start over.
            </Text>
          </View>
        )}

        {visibleMeals.map((meal) => {
          // price/calories/protein all come from the same scaleMealToTargets
          // output -- same serving size for all three, so they stay
          // internally consistent (a recipe sliced into more, smaller
          // servings to fit the calorie ceiling costs less per serving too).
          const effectivePrice = meal.price;

          return (
          <View key={meal.id} style={styles.mealCardOuter}>
            <View pointerEvents="none" style={styles.mealCardShadow} />
            <View style={styles.mealCard}>
            <View style={[styles.mealImagePlaceholder, getRecipeImage(meal.name) && styles.mealImagePlaceholderPhoto]}>
              {getRecipeImage(meal.name) ? (
                <Image source={getRecipeImage(meal.name)} style={styles.mealImage} resizeMode="cover" />
              ) : (
                <CakeIcon size={28} color="#ccc" />
              )}
              {selectedIds.has(meal.id) && (
                <View style={styles.groceryConfirmBadge}>
                  <CheckIcon size={12} color="#fff" />
                  <Text style={styles.groceryConfirmBadgeText}>Added</Text>
                </View>
              )}
              <Pressable style={styles.saveButton} onPress={() => handleToggleSaved(meal.id)} hitSlop={8}>
                {savedIds.has(meal.id) ? (
                  <HeartIconSolid size={20} color="#e0245e" />
                ) : (
                  <HeartIcon size={20} color="#111" strokeWidth={2} />
                )}
              </Pressable>
            </View>
            <View style={styles.mealCardBody}>
              <View style={styles.mealHeaderRow}>
                <Text style={styles.mealName}>{meal.name}</Text>
              </View>
              <View style={styles.priceNutritionRow}>
                <View style={styles.priceBlock}>
                  <Text style={styles.mealPrice}>${effectivePrice.toFixed(2)}</Text>
                  <Text style={styles.perServing}>/ serving</Text>
                </View>
                <View style={styles.nutritionRow}>
                  <View style={styles.nutritionItem}>
                    <RestaurantIcon size={16} color="#888" />
                    <Text style={styles.nutritionText}>{meal.calories} cal</Text>
                  </View>
                  <View style={styles.nutritionItem}>
                    <AvocadoBeanIcon size={16} color="#888" />
                    <Text style={styles.nutritionText}>{meal.protein}g protein</Text>
                  </View>
                </View>
              </View>
              {targets.maxCalories !== undefined && targets.minProtein !== undefined && (
                <Text
                  style={styles.mealTargetsHint}
                  onPress={() => router.push('/(tabs)/plan-meals')}
                >
                  Based on {targets.maxCalories} cal, {targets.minProtein}g protein. Adjust your
                  meal size to lower price per serving.
                </Text>
              )}
              <View style={[styles.tipPill, styles.tipPillInCard]}>
                <LightBulbIcon size={20} color={INK} strokeWidth={2} />
                <Text style={styles.tip}>
                  Want lower price per serving? Adjust your{' '}
                  <Text style={styles.tipLink} onPress={() => router.push('/(tabs)/plan-meals')}>
                    meal settings
                  </Text>
                  .
                </Text>
              </View>
              {meal.dealTags.length > 0 && (
                <View style={styles.dealTagsRow}>
                  {meal.dealTags.map((dealTag) => (
                    <View key={dealTag.name} style={styles.dealTagRow}>
                      {dealTag.discountPct >= MIN_DISPLAYED_DISCOUNT_PCT ? (
                        <View style={styles.dealTagBadge}>
                          <Text style={styles.dealTagBadgeText}>{dealTag.discountPct}% off</Text>
                        </View>
                      ) : (
                        <View style={styles.fairPriceBadge}>
                          <Text style={styles.dealTagBadgeText}>Fair price</Text>
                        </View>
                      )}
                      <Text style={styles.dealTagName} numberOfLines={1}>
                        {toTitleCase(dealTag.name)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.buttonsRow}>
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
                    {selectedIds.has(meal.id) ? 'Remove from list' : 'Add to list'}
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
            </View>
          </View>
          );
        })}

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
  gradient: { flex: 1, backgroundColor: '#FFEAD4' },
  container: { flex: 1 },
  loadingContainer: { alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 20, paddingTop: 60, gap: 16 },
  title: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  subtitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: -8 },
  subtitle: { fontSize: 14, color: INK, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  tipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  tipPillInCard: { backgroundColor: '#FFEAD4' },
  tip: { fontSize: 13, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold', color: INK },
  tipLink: { textDecorationLine: 'underline' },
  emptyState: { backgroundColor: '#F2F2F2', borderRadius: 14, padding: 20 },
  emptyStateText: { color: '#666', fontSize: 14, textAlign: 'center' },
  mealCardOuter: { position: 'relative' },
  // Same flat offset-shadow technique as the legal modal's card.
  mealCardShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    borderRadius: 24,
    transform: [{ translateX: -1 }, { translateY: 1 }],
  },
  mealCard: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 24,
    overflow: 'hidden',
  },
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
    height: 180,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Matches the pre-cropped card photo's own aspect ratio (see
  // lib/recipeImages.ts) so the full width of that crop shows with no
  // further side-cropping, instead of the fixed height above forcing a
  // narrower "cover" crop.
  mealImagePlaceholderPhoto: { height: 'auto', aspectRatio: 1402 / 412 },
  mealImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  saveButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffffcc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groceryConfirmBadge: {
    position: 'absolute',
    top: 14,
    right: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1E9E5A',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  groceryConfirmBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  mealCardBody: { padding: 14, gap: 10 },
  mealHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  mealName: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', flex: 1, marginRight: 8 },
  priceNutritionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 12,
  },
  priceBlock: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  nutritionRow: { flexDirection: 'row', gap: 16 },
  nutritionItem: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  nutritionText: { fontSize: 13, color: '#888' },
  mealPrice: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  perServing: { fontSize: 13, color: '#888' },
  mealTargetsHint: { fontSize: 12, fontStyle: 'italic', color: '#767676' },
  dealTagsRow: { gap: 6 },
  dealTagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dealTagName: { color: '#888', fontSize: 13, flex: 1 },
  dealTagBadge: { backgroundColor: '#96E696', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  dealTagBadgeText: { color: INK, fontSize: 12, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  fairPriceBadge: { backgroundColor: '#96E696', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  buttonsRow: { flexDirection: 'row', gap: 10 },
  groceryToggleButton: {
    flex: 1,
    height: 56,
    justifyContent: 'center',
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 999,
    alignItems: 'center',
  },
  groceryToggleButtonActive: { backgroundColor: INK },
  groceryToggleButtonText: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  groceryToggleButtonTextActive: { color: '#fff' },
  recipeButton: {
    flex: 1,
    height: 56,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 999,
    alignItems: 'center',
  },
  recipeButtonText: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
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
