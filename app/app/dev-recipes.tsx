import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StarIcon } from 'react-native-heroicons/outline';
import { StarIcon as StarIconSolid } from 'react-native-heroicons/solid';

import { MealCard } from '../components/MealCard';
import type { Meal } from '../lib/mealData';
import { fetchAllRecipes } from '../lib/recipes';
import { supabase } from '../lib/supabase';
import { useSavedRecipes } from '../lib/savedRecipes';
import { useSelectedMeals } from '../lib/selectedMeals';

const INK = '#111';
const ACCENT = '#FFA955';
// Intended weekly count (Anabelle, 2026-09-11) -- not enforced, just
// shown as a live counter so it's obvious at a glance whether this
// week's set is under/over/on target while toggling.
const TARGET_FEATURED_COUNT = 12;

// Internal-only recipe review screen -- every recipe, exactly as the
// Meals tab renders it (same MealCard component), with no login and no
// subscription check. Built because Anabelle's actual recipe-review
// workflow is checking how a recipe she's editing looks in the app, and
// having to sign in each time (even with a valid trial account) was
// friction that got in the way of that. Deliberately does NOT reuse
// Meals' free-tier slicing/upgrade-prompt logic -- there is none here,
// on purpose.
//
// __DEV__ is React Native's standard global, true only in a local dev
// build (expo start) and false in any production build (EAS build,
// `expo export --no-dev`, etc.) -- this screen literally can't do
// anything in a real build, even if someone finds the URL.
export default function DevRecipesScreen() {
  const { savedIds, toggleSaved } = useSavedRecipes();
  const { selectedIds, toggleSelected } = useSelectedMeals();
  const [meals, setMeals] = useState<Meal[]>([]);
  // Anabelle: "reoder (just on this page) per newest first so its
  // easier for me to review recipes". fetchAllRecipes()'s Meal type
  // (shared with every other screen -- Meals tab, saved recipes, etc.)
  // doesn't carry updated_at, and adding it there would ripple out
  // wider than this one review page needs. Fetched separately, just
  // the two columns needed, keyed by id -- scoped entirely to this
  // screen, no shared types touched.
  //
  // Sorts by updated_at, not created_at: a heavily-edited recipe (e.g.
  // Sticky Fingers Chicken, rewritten today but created back on 08-19
  // under an old name) needs to show up top when it's the one actually
  // being worked on, not stay buried under its stale creation date.
  // updated_at is a real column (20260821020000_recipes_updated_at.sql,
  // auto-bumped by a trigger on every UPDATE) -- caught live, same
  // request: Anabelle, on an unrelated Meals-tab question: "make sure
  // the recipes show the newest first" -> "I meant just for the
  // dev-recipes view".
  const [updatedAtById, setUpdatedAtById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Recipe ids currently being toggled -- disables that one row's
  // button mid-request without blocking every other row.
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  // Optimistic: flips the local meal's own featured flag immediately,
  // then calls the real write (toggle-recipe-featured Edge Function --
  // recipes has no client-writable RLS policy, same reasoning as every
  // other dev-screen write in this project). Reverts on failure so the
  // UI never quietly drifts from the real row.
  async function handleToggleFeatured(meal: Meal) {
    const nextFeatured = !meal.featured;
    setMeals((prev) => prev.map((m) => (m.id === meal.id ? { ...m, featured: nextFeatured } : m)));
    setTogglingIds((prev) => new Set(prev).add(meal.id));
    const { data, error: invokeError } = await supabase.functions.invoke<{
      id?: string;
      featured?: boolean;
      error?: string;
    }>('toggle-recipe-featured', { body: { recipe_id: meal.id, featured: nextFeatured } });
    setTogglingIds((prev) => {
      const next = new Set(prev);
      next.delete(meal.id);
      return next;
    });
    if (invokeError || typeof data?.featured !== 'boolean') {
      // Revert -- and unwrap the real error message. Same gotcha as
      // dev-deals.tsx's own submit(): supabase-js only populates `data`
      // for a real 2xx response, so a validation error's actual message
      // lives on invokeError's raw Response instead of anywhere obvious.
      setMeals((prev) => prev.map((m) => (m.id === meal.id ? { ...m, featured: meal.featured } : m)));
      let message = data?.error ?? invokeError?.message ?? 'Could not save.';
      const context = (invokeError as { context?: Response } | undefined)?.context;
      if (context && typeof context.json === 'function') {
        try {
          const body = (await context.json()) as { error?: string };
          if (body?.error) message = body.error;
        } catch {
          // Body wasn't JSON (or already consumed) -- keep the fallback above.
        }
      }
      Alert.alert('Could not update featured', message);
    }
  }

  useEffect(() => {
    Promise.all([
      fetchAllRecipes(),
      supabase
        .from('recipes')
        .select('id, updated_at')
        .then(({ data }) => Object.fromEntries((data ?? []).map((r) => [r.id, r.updated_at]))),
    ])
      .then(([recipeMeals, updatedAt]) => {
        setMeals(recipeMeals);
        setUpdatedAtById(updatedAt);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (!__DEV__) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.notDevText}>This screen only exists in local development builds.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={INK} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.notDevText}>Couldn't load recipes. Check the dev server/console.</Text>
      </View>
    );
  }

  // Newest-worked-on first -- missing/unknown updated_at (shouldn't
  // happen, but fetch failures degrade gracefully) sorts to the end
  // rather than crashing or clumping at the top.
  const sorted = [...meals].sort((a, b) => {
    const aTime = updatedAtById[a.id] ? new Date(updatedAtById[a.id]).getTime() : -Infinity;
    const bTime = updatedAtById[b.id] ? new Date(updatedAtById[b.id]).getTime() : -Infinity;
    return bTime - aTime;
  });

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.devBanner}>
          <Text style={styles.devBannerText}>
            DEV ONLY -- all {meals.length} recipes, no login, no free-tier limit
          </Text>
        </View>
        <Text style={styles.title}>All Recipes</Text>
        <Text style={styles.subtitle}>
          {sorted.length} recipe{sorted.length === 1 ? '' : 's'} · deal-tagged and not, newest first
        </Text>
        {/* Live count against the intended weekly target -- not
            enforced, just a glance-able guide while toggling (Anabelle,
            2026-09-11: "Weekly, we will display 12 recipes"). */}
        <Text style={styles.featuredCount}>
          {meals.filter((m) => m.featured).length} of {TARGET_FEATURED_COUNT} featured this week
        </Text>

        {sorted.map((meal) => (
          <View key={meal.id} style={styles.recipeBlock}>
            <Pressable
              style={[styles.featureToggle, meal.featured && styles.featureToggleActive]}
              onPress={() => handleToggleFeatured(meal)}
              disabled={togglingIds.has(meal.id)}
            >
              {togglingIds.has(meal.id) ? (
                <ActivityIndicator size="small" color={meal.featured ? INK : '#888'} />
              ) : meal.featured ? (
                <StarIconSolid size={16} color={INK} />
              ) : (
                <StarIcon size={16} color="#888" />
              )}
              <Text style={[styles.featureToggleText, meal.featured && styles.featureToggleTextActive]}>
                {meal.featured ? 'Featured this week' : 'Feature this week'}
              </Text>
            </Pressable>
            <MealCard
              meal={meal}
              isSelected={selectedIds.has(meal.id)}
              isSaved={savedIds.has(meal.id)}
              onToggleSelected={() => toggleSelected(meal.id)}
              onToggleSaved={() => toggleSaved(meal.id)}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFEAD4' },
  centered: { alignItems: 'center', justifyContent: 'center' },
  notDevText: { padding: 24, fontSize: 15, color: '#888', textAlign: 'center' },
  scrollContent: { padding: 20, paddingTop: 60, gap: 16 },
  devBanner: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  devBannerText: { color: '#fff', fontSize: 12, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  title: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  subtitle: { fontSize: 14, color: INK, fontWeight: '700', fontFamily: 'OpenSans_700Bold', marginTop: -8 },
  featuredCount: { fontSize: 13, color: '#888', marginTop: -8 },
  recipeBlock: { gap: 8 },
  featureToggle: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#ccc',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  featureToggleActive: { backgroundColor: ACCENT, borderColor: INK },
  featureToggleText: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: '#888' },
  featureToggleTextActive: { color: INK },
});
