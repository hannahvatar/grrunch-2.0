import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ClockIcon, MinusIcon, PlusIcon, XMarkIcon } from 'react-native-heroicons/outline';

import { IngredientRow } from '../components/IngredientRow';
import type { Meal } from '../lib/mealData';
import { resizeMealServings, servingsOptions } from '../lib/mealScaling';
import { fetchRecipeById } from '../lib/recipes';

const INK = '#111';

// Recipe detail — presented as a modal over the Meals tab, opened via each
// meal card's "View recipe" button. Not covered by a wireframe yet, so this
// stays plain/functional like the rest of the guest-mode flow.
export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [rawMeal, setRawMeal] = useState<Meal | null | undefined>(undefined);
  // Manual override of the recipe's own natural serving count, via the
  // stepper below -- null means "show it as authored". Reset whenever a
  // different recipe is opened, so a stale override from a previous
  // recipe never lingers.
  const [servingsOverride, setServingsOverride] = useState<number | null>(null);

  useEffect(() => {
    if (!id) {
      setRawMeal(null);
      return;
    }
    fetchRecipeById(id)
      .then(setRawMeal)
      .catch(() => setRawMeal(null));
  }, [id]);

  useEffect(() => {
    setServingsOverride(null);
  }, [rawMeal?.id]);

  const meal =
    rawMeal && servingsOverride !== null ? resizeMealServings(rawMeal, servingsOverride) : rawMeal;
  // Whole multiples of the recipe's own natural serving count -- you
  // can't buy a fraction of a deal-tagged package, so "N+1 servings"
  // isn't a real option; making another whole batch is.
  const options = rawMeal ? servingsOptions(rawMeal.servings) : null;
  // How many whole batches the stepper is asking for -- 1 when shown as
  // authored. `meal` (via resizeMealServings) already scaled every
  // staple ingredient's own displayed quantity by this; deal-tagged
  // lines are the one exception (never fragmented, so a doubled batch
  // still reads "1 package ...") and need this multiplier passed through
  // separately to show as a x2 badge instead -- see IngredientRow below.
  const batchMultiplier =
    rawMeal && servingsOverride !== null ? servingsOverride / rawMeal.servings : 1;

  if (meal === undefined) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#111" />
      </View>
    );
  }

  if (!meal) {
    return (
      <View style={styles.container}>
        <Text style={styles.notFound}>Recipe not found.</Text>
      </View>
    );
  }

  // groupDealItemsTogether (lib/recipes.ts) already sorted these to the
  // front of meal.ingredients -- splitting here just lets the two groups
  // render in visually distinct containers (deal items in their own
  // white card, staples on the page's plain peach background) without
  // re-deriving the grouping.
  const dealIngredients = meal.ingredients.filter((ingredient) => ingredient.dealTag);
  const stapleIngredients = meal.ingredients.filter((ingredient) => !ingredient.dealTag);

  return (
    <View style={styles.container}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{meal.name}</Text>
          <View style={styles.subtitleRow}>
            <ClockIcon size={13} color={INK} />
            <Text style={styles.subtitle}>{meal.minutes} min</Text>
          </View>
        </View>
        <Pressable
          style={styles.closeButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/meals'))}
        >
          <XMarkIcon size={18} color={INK} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.macrosRow}>
          <View style={styles.macroPill}>
            <Text style={styles.macroValue}>${meal.price.toFixed(2)}</Text>
            <Text style={styles.macroLabel}>/ serving</Text>
          </View>
          <View style={styles.macroPill}>
            <Text style={styles.macroValue}>{meal.calories}</Text>
            <Text style={styles.macroLabel}>kcal</Text>
          </View>
          <View style={styles.macroPill}>
            <Text style={styles.macroValue}>{meal.protein} g</Text>
            <Text style={styles.macroLabel}>protein</Text>
          </View>
        </View>

        {options && (
          <View style={styles.stepperRow}>
            <Text style={styles.stepperLabel}>Servings</Text>
            <View style={styles.stepperControl}>
              <Pressable
                style={[styles.stepperButton, meal.servings <= options[0] && styles.stepperButtonDisabled]}
                onPress={() => {
                  const i = options.indexOf(meal.servings);
                  if (i > 0) setServingsOverride(options[i - 1]);
                }}
                disabled={meal.servings <= options[0]}
                hitSlop={8}
              >
                <MinusIcon size={14} color="#111" />
              </Pressable>
              <Text style={styles.stepperValue}>{meal.servings}</Text>
              <Pressable
                style={[
                  styles.stepperButton,
                  meal.servings >= options[options.length - 1] && styles.stepperButtonDisabled,
                ]}
                onPress={() => {
                  const i = options.indexOf(meal.servings);
                  if (i >= 0 && i < options.length - 1) setServingsOverride(options[i + 1]);
                }}
                disabled={meal.servings >= options[options.length - 1]}
                hitSlop={8}
              >
                <PlusIcon size={14} color="#111" />
              </Pressable>
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>On Sale This Week</Text>
        {dealIngredients.length > 0 && (
          <View style={styles.dealIngredientsList}>
            {dealIngredients.map((ingredient, index) => (
              <View key={index} style={styles.dealIngredientCard}>
                <IngredientRow
                  text={ingredient.text}
                  dealTag={ingredient.dealTag}
                  estimatedPrice={ingredient.estimatedPrice}
                  // Never fragmented, so a doubled batch stays "1 package
                  // ..." with a x2 badge instead of a scaled quantity --
                  // see scaleIngredientDisplay.
                  multiplier={batchMultiplier}
                  // Standardized square (see IngredientRow for why a
                  // fit-to-box version was tried and reverted) -- 120 is
                  // comfortably under every source cutout's own ~400px
                  // max dimension across all chains, so this never
                  // upscales past real resolution. blurredBackdrop fills
                  // the letterboxed edges with the image's own blurred
                  // background instead of bare placeholder grey.
                  imageSize={120}
                  blurredBackdrop
                  // The recipe page has no other store attribution --
                  // shows the store name plus a "See in flyer" link out
                  // to that store's weekly flyer (curated_deals.
                  // product_url, threaded through deal_tags).
                  showStoreLink
                />
              </View>
            ))}
          </View>
        )}
        {stapleIngredients.length > 0 && (
          <Text style={styles.sectionTitle}>You'll Also Need</Text>
        )}
        <View style={styles.ingredientsListCard}>
          {stapleIngredients.map((ingredient, index) => (
            <IngredientRow
              key={index}
              text={ingredient.text}
              estimatedPrice={ingredient.estimatedPrice}
            />
          ))}
        </View>

        <Text style={styles.sectionTitle}>Instructions</Text>
        <View style={styles.instructionsCard}>
          {meal.instructions.map((step, index) => (
            <Text key={step} style={styles.listItem}>
              {index + 1}.  {step}
            </Text>
          ))}
        </View>

        {meal.optionalAdditions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Optional</Text>
            <View style={styles.optionalList}>
              {meal.optionalAdditions.map((addition) => (
                <Text key={addition.title} style={styles.optionalText}>
                  <Text style={styles.optionalTitle}>{addition.title}</Text>
                  {'  —  '}
                  {addition.description}
                </Text>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Matches the Meals tab / dev-recipes list's own background (see
  // app/(tabs)/meals.tsx `gradient`, app/dev-recipes.tsx `container`) --
  // this modal is a continuation of that screen, not a separate white
  // sheet.
  container: { flex: 1, backgroundColor: '#FFEAD4' },
  loadingContainer: { alignItems: 'center', justifyContent: 'center' },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
  },
  headerText: { flex: 1, marginRight: 12 },
  title: { fontSize: 20, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  subtitle: { fontSize: 14, color: INK },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 4 },
  macrosRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  macroPill: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  macroValue: { fontSize: 16, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  macroLabel: { fontSize: 11, color: '#888' },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  stepperLabel: { fontSize: 14, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold', color: '#333' },
  stepperControl: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonDisabled: { opacity: 0.35 },
  stepperValue: { fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold', minWidth: 16, textAlign: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', marginTop: 16, marginBottom: 8 },
  // Each deal-tagged ingredient gets its own white card, set apart from
  // the page's plain peach background -- calls out "this one's actually
  // on sale" per item, distinct from the staples below (see
  // groupDealItemsTogether, lib/recipes.ts, for why they're already
  // contiguous in meal.ingredients).
  dealIngredientsList: { gap: 10, marginBottom: 6 },
  dealIngredientCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
  },
  // Single shared white card (not one-per-item like dealIngredientCard
  // above) -- these aren't individually on sale, so they don't need
  // the same per-item visual weight, just set apart as a group from the
  // page's plain peach background.
  ingredientsListCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  instructionsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  listItem: { fontSize: 15, lineHeight: 24, color: '#333' },
  // Not a priced ingredient list -- a short paragraph per suggestion,
  // title inline-bolded rather than styled as its own list row, so it
  // reads as "here's an idea" rather than "here's what to buy."
  optionalList: { gap: 12 },
  optionalText: { fontSize: 15, lineHeight: 24, color: '#333' },
  optionalTitle: { fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  notFound: { padding: 24, fontSize: 15, color: '#888' },
});
