import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ClockIcon, MinusIcon, PlusIcon, XMarkIcon } from 'react-native-heroicons/outline';

import { IngredientRow } from '../components/IngredientRow';
import { AvocadoBeanIcon, RestaurantIcon } from '../components/MaterialSymbols';
import type { Meal } from '../lib/mealData';
import { resizeMealServings, servingsOptions } from '../lib/mealScaling';
import { fetchRecipeById } from '../lib/recipes';
import { useSelectedMeals } from '../lib/selectedMeals';

const ACCENT = '#FFA955';

const INK = '#111';

// Recipe detail — presented as a modal over the Meals tab, opened via each
// meal card's "View recipe" button. Not covered by a wireframe yet, so this
// stays plain/functional like the rest of the guest-mode flow.
export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Same context the Meals tab's own "Add to list" toggle uses (see
  // meals.tsx) -- shared with the grocery list, so toggling here shows
  // up there too.
  const { selectedIds, toggleSelected } = useSelectedMeals();
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
      {/* Only the close button stays pinned outside the ScrollView --
          the title/duration used to sit fixed up here too, but now
          scroll away with everything else below. */}
      <View style={styles.header}>
        <Pressable
          style={styles.closeButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/meals'))}
        >
          <XMarkIcon size={18} color={INK} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{meal.name}</Text>
          <View style={styles.subtitleRow}>
            <ClockIcon size={13} color={INK} />
            <Text style={styles.subtitle}>{meal.minutes} min</Text>
          </View>
        </View>
        {/* Same layout as MealCard's own priceNutritionRow (the Meals
            results page) -- price/cal/protein as plain icon+text, not
            pills, all on one line. Only real difference from MealCard:
            everything here is black (INK) instead of MealCard's grey
            secondary text/icons, and there's no min. servings note --
            the stepper right below already covers that. */}
        <View style={styles.priceNutritionRow}>
          <View style={styles.priceBlock}>
            <Text style={styles.mealPrice}>${meal.price.toFixed(2)}</Text>
            <Text style={styles.perServing}>/ serving</Text>
          </View>
          <View style={styles.nutritionRow}>
            <View style={styles.nutritionItem}>
              <RestaurantIcon size={16} color={INK} />
              <Text style={styles.nutritionText}>{meal.calories} cal</Text>
            </View>
            <View style={styles.nutritionItem}>
              <AvocadoBeanIcon size={16} color={INK} />
              <Text style={styles.nutritionText}>{meal.protein}g protein</Text>
            </View>
          </View>
        </View>

        {options && (
          <View style={styles.stepperActionRow}>
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
                  <MinusIcon size={14} color={INK} />
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
                  <PlusIcon size={14} color={INK} />
                </Pressable>
              </View>
            </View>
            <Pressable
              style={[styles.addToListButton, selectedIds.has(meal.id) && styles.addToListButtonActive]}
              onPress={() => toggleSelected(meal.id)}
            >
              <Text
                style={[
                  styles.addToListButtonText,
                  selectedIds.has(meal.id) && styles.addToListButtonTextActive,
                ]}
              >
                {selectedIds.has(meal.id) ? 'Remove from list' : 'Add to my list'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Deal items and staples each get their own bordered "modal
            treatment" container (same white/black-border/rounded-corner
            language as the app's cards/modals elsewhere -- see
            MealCard.tsx mealCard, LegalDocumentModal.tsx), rather than
            sharing one box. Each card carries its own heading inside it
            -- same pattern as the Instructions card below -- under the
            shared "What you'll need" umbrella title, which still covers both
            since the staples group is not on sale. */}
        <Text style={styles.sectionTitle}>What you'll need</Text>
        {dealIngredients.length > 0 && (
          <View style={styles.ingredientsModalCard}>
            <Text style={styles.innerSectionTitleFirst}>On Sale This Week</Text>
            <View style={styles.dealIngredientsList}>
              {dealIngredients.map((ingredient, index) => (
                <IngredientRow
                  key={index}
                  text={ingredient.text}
                  dealTag={ingredient.dealTag}
                  estimatedPrice={ingredient.estimatedPrice}
                  // Never fragmented, so a doubled batch stays "1
                  // package ..." with a x2 badge instead of a scaled
                  // quantity -- see scaleIngredientDisplay.
                  multiplier={batchMultiplier}
                  // Standardized square (see IngredientRow for why a
                  // fit-to-box version was tried and reverted) -- still
                  // comfortably under every source cutout's own ~400px
                  // max dimension across all chains, so this never
                  // upscales past real resolution. Sized down from 120
                  // to fit the design reference's more compact
                  // thumbnail alongside a full name/store/link column.
                  // blurredBackdrop fills the letterboxed edges with
                  // the image's own blurred background instead of
                  // bare placeholder grey.
                  imageSize={88}
                  blurredBackdrop
                  // The recipe page has no other store attribution --
                  // shows the store name plus a "See in flyer" link
                  // out to that store's weekly flyer (curated_deals.
                  // product_url, threaded through deal_tags).
                  showStoreLink
                  // At this imageSize, a side-by-side row leaves too
                  // little width for the name/store/link text on a
                  // phone screen -- stacks the name block full-width
                  // under the image + price row instead.
                  stackedLayout
                />
              ))}
            </View>
          </View>
        )}
        {stapleIngredients.length > 0 && (
          <View
            style={[
              styles.ingredientsModalCard,
              dealIngredients.length > 0 && styles.ingredientsModalCardStacked,
            ]}
          >
            <Text style={styles.innerSectionTitleFirst}>From your pantry</Text>
            <View style={styles.staplesList}>
              {stapleIngredients.map((ingredient, index) => (
                <IngredientRow
                  key={index}
                  text={ingredient.text}
                  estimatedPrice={ingredient.estimatedPrice}
                />
              ))}
            </View>
          </View>
        )}

        <View style={styles.instructionsCard}>
          <Text style={styles.innerSectionTitleFirst}>Instructions</Text>
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
  // Just the close button now -- title/duration moved into the
  // ScrollView below, so this row only needs to hold and right-align
  // that one pinned element. alignSelf: 'flex-end' shrinks the row down
  // to the button's own size (rather than stretching full-width, the
  // row's default) so its white background reads as a small patch
  // right behind the button, not a white bar across the whole top of
  // the page.
  header: {
    alignSelf: 'flex-end',
    padding: 20,
    paddingBottom: 0,
    backgroundColor: '#fff',
  },
  headerText: { marginBottom: 16 },
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
  // Mirrors MealCard's own priceNutritionRow/priceBlock/nutritionRow
  // values (fontSize/weight/gap), except color (black here vs
  // MealCard's grey secondary text/icons), one line always (MealCard
  // can wrap), and alignItems -- MealCard uses 'baseline', which looked
  // right there but measurably (getBoundingClientRect) did NOT line up
  // "375 cal"/"20.8g protein" with "/ serving" here: outer
  // align-items: baseline recomputes each flex item's cross-axis
  // position from its own synthetic baseline, and that recalculation
  // happens AFTER margin is applied to the item -- so a marginTop nudge
  // on nutritionRow measurably shifted nutritionRow's own box (confirmed
  // via computed style) but the browser then re-shifted it back by the
  // same amount to preserve baseline alignment, netting zero visible
  // change. 'flex-end' instead bottom-aligns each child's actual box
  // (unaffected by font baseline metrics), which is what actually lines
  // up mealPrice's box-bottom with nutritionRow's box-bottom -- verified
  // by remeasuring after switching.
  priceNutritionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'nowrap',
    gap: 12,
    marginBottom: 16,
  },
  // Grouped into priceBlock/nutritionRow (not flattened directly into
  // priceNutritionRow) to match MealCard's exact nesting.
  priceBlock: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  // marginBottom pulls nutritionRow's text up to match perServing's own
  // baseline-computed bottom exactly (both are 13px text) -- flex-end
  // alone bottom-aligns nutritionRow's box against mealPrice's full box
  // (which extends further down, past its own baseline, to account for
  // descenders on a 24px font), overshooting past where 13px text
  // actually belongs. Margin works correctly here because flex-end
  // (unlike baseline) doesn't recompute position to cancel it out --
  // verified by remeasuring (getBoundingClientRect) after each change.
  nutritionRow: { flexDirection: 'row', gap: 16, marginBottom: 4 },
  mealPrice: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  perServing: { fontSize: 13, color: INK },
  nutritionItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nutritionText: { fontSize: 13, color: INK },
  // Servings stepper pill + "Add to my list" button share one row.
  stepperActionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  stepperRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  stepperLabel: { fontSize: 14, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold', color: '#333' },
  stepperControl: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonDisabled: { opacity: 0.35 },
  stepperValue: { fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold', minWidth: 16, textAlign: 'center' },
  // Same primary-button language as MealCard's own groceryToggleButton
  // (Meals tab), toggling the same selectedMeals context -- checking it
  // off here shows up as already-added on the Meals tab and in the
  // grocery list too.
  addToListButton: {
    height: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 999,
  },
  addToListButtonActive: { backgroundColor: INK },
  addToListButtonText: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  addToListButtonTextActive: { color: '#fff' },
  sectionTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', marginTop: 16, marginBottom: 8 },
  // "Modal treatment": same white/2px-black-border/rounded-corner
  // language as the app's cards and modals elsewhere (MealCard.tsx
  // mealCard, LegalDocumentModal.tsx). Used once per ingredient group
  // -- the deal items and the staples each get their own box.
  ingredientsModalCard: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 16,
    padding: 14,
  },
  // Only when the staples card follows the deal card: scrollContent's
  // own 4px gap is too tight to read as two distinct bordered boxes.
  ingredientsModalCardStacked: { marginTop: 12 },
  // A card's own heading needs no top margin -- the card's padding
  // already separates it from the border.
  innerSectionTitleFirst: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', marginBottom: 8 },
  dealIngredientsList: { gap: 10 },
  staplesList: { gap: 10 },
  instructionsCard: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
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
