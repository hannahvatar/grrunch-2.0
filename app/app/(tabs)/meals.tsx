import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CheckIcon, ChevronDownIcon, LockClosedIcon } from 'react-native-heroicons/outline';

import { AccountBanner } from '../../components/AccountBanner';
import { MealCard } from '../../components/MealCard';
import type { Meal } from '../../lib/mealData';
import { type MealSortMode, sortMealsByName, sortMealsByPrice } from '../../lib/mealScaling';
import { fetchAllRecipes } from '../../lib/recipes';
import { useSavedRecipes } from '../../lib/savedRecipes';
import { useSelectedMeals } from '../../lib/selectedMeals';
import { useSubscription } from '../../lib/subscription';

const SORT_OPTIONS: { mode: MealSortMode; label: string }[] = [
  { mode: 'price', label: 'Best deal' },
  { mode: 'alphabetical', label: 'A to Z' },
];

// GRRUNCH DS -- matches login.tsx/index.tsx/location.tsx/stores.tsx's palette.
const ACCENT = '#FFA955';
const INK = '#111';

// Free tier sees only the first 3 meal recommendations -- Grrunch Plus
// (30-day free trial, then $5.99/mo) unlocks the rest. A single "Unlock N
// more recipes" tile stands in for however many are left, naming the real
// count rather than a generic upsell.
const FREE_MEAL_LIMIT = 3;

// Guest-mode wireframe step 6 — Main App, Meals tab (the app's landing
// tab now that there's no separate Plan step before it).
// Every recipe with an active deal shows, full stop -- coverage and real
// cost-per-serving matter more here than hitting an exact macro number
// (see lib/mealScaling.ts). There's no per-user calorie/protein target to
// sort against anymore: every recipe's own serving is designed to land in
// a normal range (~500 cal / ~20g protein, +/-30%) by construction, not
// by a live filter. The sort dropdown below just reorders this same
// always-shown list by price or name; nothing gets hidden or resized.
//
// Recipes are persistent and reused week to week, but their deal_tags are
// re-matched against each new week's curated_deals -- a recipe with none
// of its ingredients currently on sale stops surfacing here entirely
// (rather than showing at regular price) until one of them is on sale
// again, since the app's whole value prop is deal-driven meal planning.
function eligibleMeals(allMeals: Meal[], sortMode: MealSortMode): Meal[] {
  const withDeals = allMeals.filter((m) => m.dealTags.length > 0);
  return sortMode === 'alphabetical' ? sortMealsByName(withDeals) : sortMealsByPrice(withDeals);
}

export default function MealsScreen() {
  const { savedIds, toggleSaved } = useSavedRecipes();
  const { selectedIds, toggleSelected } = useSelectedMeals();
  const { isSubscribed } = useSubscription();

  const [allMeals, setAllMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<MealSortMode>('price');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

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

  const sortedMeals = eligibleMeals(allMeals, sortMode);
  const visibleMeals = isSubscribed ? sortedMeals : sortedMeals.slice(0, FREE_MEAL_LIMIT);
  const lockedMealCount = sortedMeals.length - visibleMeals.length;

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
          <View style={styles.sortSection}>
            <Text style={styles.sortByLabel}>Sort by:</Text>
            <View>
              <Pressable style={styles.sortPill} onPress={() => setSortMenuOpen((open) => !open)}>
                <Text style={styles.sortPillText}>
                  {SORT_OPTIONS.find((o) => o.mode === sortMode)?.label}
                </Text>
                <ChevronDownIcon size={16} color={INK} strokeWidth={2} />
              </Pressable>
              {sortMenuOpen && (
                <View style={styles.sortMenu}>
                  {SORT_OPTIONS.map((option) => (
                    <Pressable
                      key={option.mode}
                      style={styles.sortMenuItem}
                      onPress={() => {
                        setSortMode(option.mode);
                        setSortMenuOpen(false);
                      }}
                    >
                      <Text style={styles.sortMenuItemText}>{option.label}</Text>
                      {sortMode === option.mode && <CheckIcon size={16} color={INK} strokeWidth={2} />}
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </View>
        </View>

        {sortedMeals.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No deals available for a recipe right now. Check back when this week's flyers
              update.
            </Text>
          </View>
        )}

        {visibleMeals.map((meal) => (
          <MealCard
            key={meal.id}
            meal={meal}
            isSelected={selectedIds.has(meal.id)}
            isSaved={savedIds.has(meal.id)}
            onToggleSelected={() => toggleSelected(meal.id)}
            onToggleSaved={() => handleToggleSaved(meal.id)}
          />
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

        {sortedMeals.length > 0 && (
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
  // zIndex here (well above the mealCardOuter siblings below it, which sit
  // at the default stacking level) is load-bearing on web: React Native
  // Web gives every View an explicit zIndex (0, not auto), so each level
  // of nesting is its own stacking context -- a high zIndex set deep
  // inside (e.g. just on sortSection) only wins against ITS siblings, not
  // against mealCardOuter further up the tree. It has to go on the
  // container that's the actual sibling of the meal cards.
  subtitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: -8,
    zIndex: 20,
  },
  subtitle: { fontSize: 14, color: INK, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  sortSection: { alignItems: 'flex-end' },
  sortByLabel: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'OpenSans_700Bold',
    color: INK,
    marginBottom: 6,
  },
  sortPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: INK,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  sortPillText: { fontSize: 13, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold', color: INK },
  sortMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 6,
    minWidth: 240,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: INK,
    borderRadius: 14,
    paddingVertical: 4,
    zIndex: 10,
    elevation: 4,
  },
  sortMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  sortMenuItemText: { fontSize: 13, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold', color: INK, flex: 1 },
  emptyState: { backgroundColor: '#F2F2F2', borderRadius: 14, padding: 20 },
  emptyStateText: { color: '#666', fontSize: 14, textAlign: 'center' },
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
