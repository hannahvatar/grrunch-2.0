import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronRightIcon, LockClosedIcon } from 'react-native-heroicons/outline';

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
//
// Shows exactly this week's featured set (recipes.featured, toggled by
// hand via dev-recipes.tsx -- see 20260911020000_recipes_featured_flag.sql)
// -- NOT "every recipe with an active deal", which was the rule here
// until a real repro (Anabelle, 2026-09-11: "Weekly, we will display 12
// recipes... Ensure we are displaying here 12 recipes") turned up that
// the old auto-filter was showing 38 of 41 recipes with zero cap or
// curation. A featured recipe is typically also deal-tagged (the normal
// case: pulled from the database because one of its ingredients is on
// sale this week), but doesn't have to be -- a custom recipe built just
// for this week can be featured with no deal tag at all. `featured` is
// now the one real gate; deal tags still drive pricing/badges on the
// card itself, just not visibility.
//
// cost-per-serving matters more here than hitting an exact macro number
// (see lib/mealScaling.ts). There's no per-user calorie/protein target to
// sort against anymore: every recipe's own serving is designed to land in
// a normal range (~500 cal / ~20g protein, +/-30%) by construction, not
// by a live filter, and its own real price/serving stays under $4 --
// the servings count is the lever for that (divide a deal anchor's
// fixed package cost across more portions), never the ingredients or
// macro target, which don't move price at all for a deal-tagged item
// (see lib/mealScaling.ts's price-vs-quantity note). The sort dropdown
// below just reorders this same list by price or name; nothing gets
// hidden or resized beyond the featured filter above.
//
// Always cheapest-first (sortMealsByPrice) -- was the default order behind
// a "Sort by" dropdown (Cheapest / Best Deals) that Anabelle asked to
// remove (2026-09-07: didn't think it was needed). sortMealsByBestDeal
// still lives in lib/mealScaling.ts if that ever needs to come back.
function eligibleMeals(allMeals: Meal[]): Meal[] {
  const featured = allMeals.filter((m) => m.featured);
  return sortMealsByPrice(featured);
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

  // Membership-gated (Anabelle, 2026-09-09: "With a free account BUT NOT
  // MEMBERSHIP you CANT add to your grocery list") -- a deliberate
  // product gate, not a technical one (lib/selectedMeals is plain
  // in-memory state, no account needed to use it). Was isGuest-only until
  // this correction, which meant a signed-in free account could build a
  // list; now matches handleToggleSaved's own isSubscribed gate exactly,
  // since a free account and a guest should be blocked the same way here.
  function handleToggleSelected(mealId: string) {
    if (!isSubscribed) {
      router.push({ pathname: '/upgrade', params: { reason: 'add recipes to your grocery list' } });
      return;
    }
    toggleSelected(mealId);
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
        <Text style={styles.title}>Meals from This Week's Deals</Text>

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
            onToggleSelected={() => handleToggleSelected(meal.id)}
            onToggleSaved={() => handleToggleSaved(meal.id)}
            // Matches handleToggleSelected's own gate -- the lock icon/
            // dashed border on "Add to list" now shows for any
            // non-subscriber, not just a guest.
            locked={!isSubscribed}
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
  // paddingTop was 60 (clearing the status bar) -- the new persistent
  // AppTopBar ((tabs)/_layout.tsx) handles that now. Kept as its own
  // larger value (Anabelle's call), not folded back into the shared 20,
  // for clear breathing room between the white nav bar and the title
  // below it.
  scrollContent: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 20, gap: 16 },
  title: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
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
