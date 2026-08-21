import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MealCard } from '../components/MealCard';
import type { Meal } from '../lib/mealData';
import { fetchAllRecipes } from '../lib/recipes';
import { supabase } from '../lib/supabase';
import { useSavedRecipes } from '../lib/savedRecipes';
import { useSelectedMeals } from '../lib/selectedMeals';

const INK = '#111';

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

        {sorted.map((meal) => (
          <MealCard
            key={meal.id}
            meal={meal}
            isSelected={selectedIds.has(meal.id)}
            isSaved={savedIds.has(meal.id)}
            onToggleSelected={() => toggleSelected(meal.id)}
            onToggleSaved={() => toggleSaved(meal.id)}
          />
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
});
