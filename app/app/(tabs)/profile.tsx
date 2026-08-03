import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AccountBanner } from '../../components/AccountBanner';
import type { Meal } from '../../lib/mealData';
import { usePersonalTargets } from '../../lib/personalTargets';
import { fetchRecipesByIds } from '../../lib/recipes';
import { useSavedRecipes } from '../../lib/savedRecipes';
import { useSelectedStores } from '../../lib/selectedStores';
import { TIER_LIMITS } from '../../lib/tier';

const storesEditable = TIER_LIMITS.free.storesEditable;

// Not yet detailed in the wireframes beyond Saved recipes — placeholder tab.
// Grocery list access lives in its own tab (app/(tabs)/grocery.tsx).
export default function ProfileScreen() {
  const { savedIds, toggleSaved } = useSavedRecipes();
  const [savedMeals, setSavedMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);

  const { stores: myStores, loaded: storesLoaded } = useSelectedStores();

  const { targets: personalTargets, loaded: personalTargetsLoaded, setTargets: setPersonalTargets } =
    usePersonalTargets();
  const [calories, setCalories] = useState(personalTargets.calories);
  const [protein, setProtein] = useState(personalTargets.protein);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetchRecipesByIds(Array.from(savedIds))
      .then(setSavedMeals)
      .catch(() => setSavedMeals([]))
      .finally(() => setLoading(false));
  }, [savedIds]);

  // Once the saved default actually loads from storage, reflect it in the
  // sliders -- guards against clobbering a change the user's mid-way
  // through making, same pre-fill pattern as Plan your meals.
  useEffect(() => {
    if (personalTargetsLoaded) {
      setCalories(personalTargets.calories);
      setProtein(personalTargets.protein);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalTargetsLoaded]);

  function saveTargets() {
    setPersonalTargets({ calories, protein });
    setDirty(false);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <AccountBanner />

      <View style={styles.headerRow}>
        <Text style={styles.title}>Profile</Text>
        <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
          <Text style={styles.gearIcon}>⚙️</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>My stores</Text>
      {!storesEditable && (
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

      <Text style={styles.sectionTitle}>Personal targets</Text>
      <Text style={styles.sectionHint}>
        Your default calorie and protein target -- Plan your meals starts from this every time.
      </Text>

      <View style={styles.sliderBlock}>
        <View style={styles.sliderHeaderRow}>
          <Text style={styles.label}>CALORIES PER MEAL</Text>
          <Text style={styles.sliderValue}>{calories} kcal</Text>
        </View>
        <Slider
          minimumValue={200}
          maximumValue={1000}
          step={10}
          value={calories}
          onValueChange={(value) => {
            setCalories(value);
            setDirty(true);
          }}
          minimumTrackTintColor="#111"
          maximumTrackTintColor="#ddd"
        />
      </View>

      <View style={styles.sliderBlock}>
        <View style={styles.sliderHeaderRow}>
          <Text style={styles.label}>PROTEIN PER MEAL</Text>
          <Text style={styles.sliderValue}>{protein} g</Text>
        </View>
        <Slider
          minimumValue={10}
          maximumValue={80}
          step={1}
          value={protein}
          onValueChange={(value) => {
            setProtein(value);
            setDirty(true);
          }}
          minimumTrackTintColor="#111"
          maximumTrackTintColor="#ddd"
        />
      </View>

      <Pressable
        style={[styles.saveButton, !dirty && styles.saveButtonDisabled]}
        onPress={saveTargets}
        disabled={!dirty}
      >
        <Text style={styles.saveButtonText}>{dirty ? 'Save as my default' : 'Saved'}</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Saved recipes</Text>
      {loading ? (
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
              <Text style={styles.savedHeart}>❤️</Text>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, gap: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800' },
  gearIcon: { fontSize: 22 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  sectionHint: { fontSize: 13, color: '#888', marginTop: -8 },
  sliderBlock: { marginTop: 4 },
  sliderHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { fontSize: 12, fontWeight: '700', color: '#888', letterSpacing: 0.5 },
  sliderValue: { fontSize: 18, fontWeight: '800' },
  saveButton: {
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  saveButtonDisabled: { backgroundColor: '#ddd' },
  saveButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  loadingIndicator: { marginTop: 8 },
  emptyState: { backgroundColor: '#F2F2F2', borderRadius: 14, padding: 16, gap: 10 },
  emptyStateText: { color: '#666', fontSize: 14 },
  smallLinkButton: { alignSelf: 'flex-start' },
  smallLinkButtonText: { color: '#111', fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
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
  storeAvatarText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  storeInfo: { flex: 1 },
  storeName: { fontSize: 14, fontWeight: '700' },
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
  savedHeart: { fontSize: 18 },
  savedInfo: { flex: 1 },
  savedName: { fontSize: 15, fontWeight: '700' },
  savedMeta: { fontSize: 13, color: '#888', marginTop: 2 },
});
