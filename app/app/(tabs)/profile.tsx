import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Cog6ToothIcon } from 'react-native-heroicons/outline';
import { HeartIcon } from 'react-native-heroicons/solid';

import { AccountBanner } from '../../components/AccountBanner';
import { SubRecipeCard } from '../../components/SubRecipeCard';
import { UpgradeCta } from '../../components/UpgradeCta';
import type { Meal, SubRecipe } from '../../lib/mealData';
import { fetchRecipesByIds } from '../../lib/recipes';
import { useSavedRecipes } from '../../lib/savedRecipes';
import { useSelectedStores } from '../../lib/selectedStores';
import { fetchSubRecipes } from '../../lib/subRecipes';
import { useSubscription } from '../../lib/subscription';

// Not yet fully detailed in the wireframes -- Saved recipes and
// Companion recipes are the only sections built out so far.
// Grocery list access lives in its own tab (app/(tabs)/grocery.tsx).
export default function ProfileScreen() {
  const { savedIds, toggleSaved } = useSavedRecipes();
  const [savedMeals, setSavedMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);

  const { stores: myStores, loaded: storesLoaded } = useSelectedStores();
  const { isSubscribed } = useSubscription();

  useEffect(() => {
    fetchRecipesByIds(Array.from(savedIds))
      .then(setSavedMeals)
      .catch(() => setSavedMeals([]))
      .finally(() => setLoading(false));
  }, [savedIds]);

  // Companion recipes -- member-only browse of the full shared
  // sub_recipes table (Anabelle: "make a section in the profile...
  // where users [member only] can access all the companion recipes"),
  // distinct from a single recipe page's jump-linked companion section
  // (app/recipe.tsx), which only ever shows the one relevant to that
  // meal's own ingredients. Defaults each card collapsed -- unlike
  // recipe.tsx's default-open (a jump-link lands you on the one you
  // came for), this is a browse-all list that would otherwise dump
  // every technique's full ingredients/instructions on screen at once.
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([]);
  const [subRecipesLoading, setSubRecipesLoading] = useState(true);
  const [expandedSubRecipes, setExpandedSubRecipes] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchSubRecipes()
      .then(setSubRecipes)
      .catch(() => setSubRecipes([]))
      .finally(() => setSubRecipesLoading(false));
  }, []);

  function isSubRecipeExpanded(title: string) {
    return expandedSubRecipes[title] === true;
  }
  function toggleSubRecipe(title: string) {
    setExpandedSubRecipes((prev) => ({ ...prev, [title]: !isSubRecipeExpanded(title) }));
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <AccountBanner />

      <View style={styles.headerRow}>
        <Text style={styles.title}>Profile</Text>
        <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
          <Cog6ToothIcon size={22} color="#111" />
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>My stores</Text>
      {!isSubscribed && (
        <Text style={styles.sectionHint}>Auto-selected from your location · Upgrade to customize</Text>
      )}
      {storesLoaded && myStores.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            No stores yet — set your location to find nearby stores.
          </Text>
          <Pressable style={styles.smallLinkButton} onPress={() => router.push('/location')}>
            <Text style={styles.smallLinkButtonText}>Set my location</Text>
          </Pressable>
        </View>
      ) : (
        myStores.map((store) => (
          <View key={store.id} style={styles.storeRow}>
            <View style={styles.storeAvatar}>
              <Text style={styles.storeAvatarText}>{store.initial}</Text>
            </View>
            <View style={styles.storeInfo}>
              <Text style={styles.storeName}>{store.name}</Text>
              <Text style={styles.storeSubtitle}>{store.subtitle}</Text>
            </View>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Saved recipes</Text>
      {!isSubscribed ? (
        <UpgradeCta reason="save recipes" />
      ) : loading ? (
        <ActivityIndicator size="small" color="#111" style={styles.loadingIndicator} />
      ) : savedMeals.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            No saved recipes yet — tap the ♡ on a meal in your plan to save it here.
          </Text>
        </View>
      ) : (
        savedMeals.map((meal) => (
          <View key={meal.id} style={styles.savedCard}>
            <Pressable onPress={() => toggleSaved(meal.id)} hitSlop={8}>
              <HeartIcon size={18} color="#e0245e" />
            </Pressable>
            <Pressable
              style={styles.savedInfo}
              onPress={() => router.push({ pathname: '/recipe', params: { id: meal.id } })}
            >
              <Text style={styles.savedName}>{meal.name}</Text>
              <Text style={styles.savedMeta}>
                ${meal.price.toFixed(2)} / serving · {meal.minutes} min
              </Text>
            </Pressable>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Companion recipes</Text>
      {!isSubscribed ? (
        <UpgradeCta reason="browse companion recipes" />
      ) : subRecipesLoading ? (
        <ActivityIndicator size="small" color="#111" style={styles.loadingIndicator} />
      ) : subRecipes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No companion recipes yet.</Text>
        </View>
      ) : (
        <View style={styles.subRecipesList}>
          {subRecipes.map((subRecipe) => (
            <SubRecipeCard
              key={subRecipe.title}
              subRecipe={subRecipe}
              expanded={isSubRecipeExpanded(subRecipe.title)}
              onToggle={() => toggleSubRecipe(subRecipe.title)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, gap: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  sectionTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', marginTop: 8 },
  sectionHint: { fontSize: 13, color: '#888', marginTop: -8 },
  loadingIndicator: { marginTop: 8 },
  emptyState: { backgroundColor: '#F2F2F2', borderRadius: 14, padding: 16, gap: 10 },
  emptyStateText: { color: '#666', fontSize: 14 },
  smallLinkButton: { alignSelf: 'flex-start' },
  smallLinkButtonText: { color: '#111', fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', textDecorationLine: 'underline' },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  storeAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeAvatarText: { color: '#fff', fontWeight: '700', fontFamily: 'OpenSans_700Bold', fontSize: 13 },
  storeInfo: { flex: 1 },
  storeName: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  storeSubtitle: { fontSize: 12, color: '#888', marginTop: 1 },
  savedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  savedInfo: { flex: 1 },
  savedName: { fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  savedMeta: { fontSize: 13, color: '#888', marginTop: 2 },
  subRecipesList: { gap: 12 },
});
