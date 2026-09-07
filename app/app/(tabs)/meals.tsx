import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronRightIcon, LockClosedIcon } from 'react-native-heroicons/outline';

import { AccountBanner } from '../../components/AccountBanner';
import { MealCard } from '../../components/MealCard';
import type { Meal } from '../../lib/mealData';
import { sortMealsByPrice } from '../../lib/mealScaling';
import { fetchAllRecipes } from '../../lib/recipes';
import { useSavedRecipes } from '../../lib/savedRecipes';
import { useSelectedMeals } from '../../lib/selectedMeals';
import { useSubscription } from '../../lib/subscription';

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
// by a live filter, and its own real price/serving stays under $4 --
// the servings count is the lever for that (divide a deal anchor's
// fixed package cost across more portions), never the ingredients or
// macro target, which don't move price at all for a deal-tagged item
// (see lib/mealScaling.ts's price-vs-quantity note). The sort dropdown
// below just reorders this same always-shown list by price or name;
// nothing gets hidden or resized.
//
// Recipes are persistent and reused week to week, but their deal_tags are
// re-matched against each new week's curated_deals -- a recipe with none
// of its ingredients currently on sale stops surfacing here entirely
// (rather than showing at regular price) until one of them is on sale
// again, since the app's whole value prop is deal-driven meal planning.
//
// Always cheapest-first (sortMealsByPrice) -- was the default order behind
// a "Sort by" dropdown (Cheapest / Best Deals) that Anabelle asked to
// remove (2026-09-07: didn't think it was needed). sortMealsByBestDeal
// still lives in lib/mealScaling.ts if that ever needs to come back.
function eligibleMeals(allMeals: Meal[]): Meal[] {
  const withDeals = allMeals.filter((m) => m.dealTags.length > 0);
  return sortMealsByPrice(withDeals);
}

export default function MealsScreen() {
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

  const sortedMeals = eligibleMeals(allMeals);
  const visibleMeals = isSubscribed ? sortedMeals : sortedMeals.slice(0, FREE_MEAL_LIMIT);
  const lockedMealCount = sortedMeals.length - visibleMeals.length;

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
        <Text style={styles.subtitle}>
          {visibleMeals.length} recipe{visibleMeals.length === 1 ? '' : 's'}
        </Text>

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
            <LockClosedIcon size={18} color={INK} />
            <View style={styles.unlockTextBlock}>
              <Text style={styles.unlockTitle}>Unlock this week's recipes</Text>
              <Text style={styles.unlockSubtitle}>Hand-picked from the best deals in this week's flyers</Text>
              <Text style={styles.unlockPricing}>30-day free trial · Then $5.99/mo · Cancel anytime</Text>
            </View>
            <ChevronRightIcon size={18} color={INK} />
          </Pressable>
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
  subtitle: { fontSize: 14, color: INK, fontWeight: '700', fontFamily: 'OpenSans_700Bold', marginTop: -8 },
  emptyState: { backgroundColor: '#F2F2F2', borderRadius: 14, padding: 20 },
  emptyStateText: { color: '#666', fontSize: 14, textAlign: 'center' },
  // Same dashed-outline CTA treatment as UpgradeCta's 'outline' variant
  // (components/UpgradeCta.tsx) -- Anabelle's call to match this tile to
  // every other locked-feature teaser instead of its own one-off solid
  // border. Kept as its own Pressable (not the shared component) since
  // its title/copy is specific to this week's real recipe count, not the
  // shared component's fixed "Start 30-day free trial" copy. Transparent
  // container (Anabelle's call) -- lets the screen's own background show
  // through instead of a white card floating on it.
  unlockCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: INK,
    borderRadius: 14,
    padding: 14,
  },
  unlockTextBlock: { flex: 1, gap: 2 },
  unlockTitle: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  unlockSubtitle: { fontSize: 13, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold', color: INK },
  unlockPricing: { fontSize: 12, color: INK },
});
