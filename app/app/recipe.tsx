import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ClockIcon, MinusIcon, PlusIcon, XMarkIcon } from 'react-native-heroicons/outline';

import { IngredientRow } from '../components/IngredientRow';
import { AvocadoBeanIcon, ChefHatIcon, RestaurantIcon, ShoppingModeIcon } from '../components/MaterialSymbols';
import { SubRecipeCard } from '../components/SubRecipeCard';
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
  // Sub-recipe jump links (e.g. "pork belly" -> Basic Crispy Pork Belly)
  // -- offsets captured per-section via onLayout as they render at the
  // bottom of the page, keyed by title since that's already unique
  // (sub_recipes.match_ingredient_name is a unique column, so titles
  // never collide either). scrollViewRef targets the page's own outer
  // ScrollView, the same one everything else on this screen lives in.
  const scrollViewRef = useRef<ScrollView>(null);
  const [subRecipeOffsets, setSubRecipeOffsets] = useState<Record<string, number>>({});
  function scrollToSubRecipe(title: string) {
    const y = subRecipeOffsets[title];
    if (y !== undefined) scrollViewRef.current?.scrollTo({ y, animated: true });
  }
  // Companion recipe cards default open (a key never explicitly set to
  // false reads as expanded) -- tapping the linked ingredient should
  // reveal the full technique immediately, not a collapsed teaser; the
  // chevron just lets you collapse it back down afterward.
  const [expandedSubRecipes, setExpandedSubRecipes] = useState<Record<string, boolean>>({});
  function isSubRecipeExpanded(title: string) {
    return expandedSubRecipes[title] !== false;
  }
  function toggleSubRecipe(title: string) {
    setExpandedSubRecipes((prev) => ({ ...prev, [title]: !isSubRecipeExpanded(title) }));
  }

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
      {/* Floating over the ScrollView (not a sibling row above it) so it
          reads as pinned in place over whatever scrolls beneath it,
          rather than sitting in its own opaque bar. Positioned outside
          the ScrollView entirely, so it never scrolls away. */}
      <Pressable
        style={styles.closeButton}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/meals'))}
      >
        <XMarkIcon size={18} color={INK} />
      </Pressable>
      <ScrollView ref={scrollViewRef} contentContainerStyle={styles.scrollContent}>
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

        {/* Deal items and staples share one bordered "modal treatment"
            card (same white/black-border/rounded-corner language as
            the app's cards/modals elsewhere -- see MealCard.tsx
            mealCard, LegalDocumentModal.tsx) under the shared "What
            you'll need" umbrella title, which still covers both since
            the staples group is not on sale. */}
        <Text style={styles.sectionTitle}>What you'll need</Text>
        {(dealIngredients.length > 0 || stapleIngredients.length > 0) && (
          <View style={styles.ingredientsModalCard}>
            {dealIngredients.length > 0 && (
              <View>
                <View style={styles.innerHeadingRow}>
                  <ShoppingModeIcon size={18} color={INK} />
                  <Text style={styles.dealsHeading}>On Sale This Week</Text>
                </View>
                <View style={styles.dealIngredientsList}>
                  {dealIngredients.map((ingredient, index) => {
                    // Same jump-link lookup as the pantry list below --
                    // a deal-tagged ingredient (e.g. Cauliflower on sale
                    // this week) can just as easily match a sub-recipe as
                    // a pantry-priced one; this branch just never wired
                    // it up. Found live on "BBQ Ribs 'n' Cauli Nuggets"
                    // once Cauliflower Rice was added as a companion --
                    // the section rendered, but "cauliflower" here had no
                    // link to it since it happened to be deal-tagged.
                    const subRecipe = meal.subRecipes.find(
                      (sr) => sr.matchIngredientName.toLowerCase() === ingredient.name.toLowerCase()
                    );
                    return (
                    <View key={index}>
                      {index > 0 && <View style={styles.dealDivider} />}
                      <IngredientRow
                        text={ingredient.text}
                        dealTag={ingredient.dealTag}
                        estimatedPrice={ingredient.estimatedPrice}
                        linkedText={subRecipe ? ingredient.name : undefined}
                        onLinkedTextPress={subRecipe ? () => scrollToSubRecipe(subRecipe.title) : undefined}
                        useQuantityText={ingredient.useQuantityText}
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
                        // under the image + price row instead. Also
                        // splits the leading quantity token off `text`
                        // into its own ellipse badge on the price row
                        // (see IngredientRow's dealQuantity/dealDescription).
                        stackedLayout
                      />
                    </View>
                    );
                  })}
                </View>
              </View>
            )}
            {stapleIngredients.length > 0 && (
              <View style={dealIngredients.length > 0 && styles.pantrySectionStacked}>
                {dealIngredients.length > 0 && <View style={styles.sectionDivider} />}
                <View style={styles.innerHeadingRow}>
                  <ChefHatIcon size={18} color={INK} />
                  <Text style={[styles.innerSectionTitleFirst, styles.headingRowTextReset]}>From your pantry</Text>
                </View>
                <View style={styles.staplesList}>
                  {stapleIngredients.map((ingredient, index) => {
                    // At most one match -- match_ingredient_name is
                    // unique in the sub_recipes table (see lib/
                    // subRecipes.ts / the migration), so an ingredient
                    // can never ambiguously link to two sections.
                    const subRecipe = meal.subRecipes.find(
                      (sr) => sr.matchIngredientName.toLowerCase() === ingredient.name.toLowerCase()
                    );
                    return (
                      <IngredientRow
                        key={index}
                        text={ingredient.text}
                        estimatedPrice={ingredient.estimatedPrice}
                        bulleted
                        linkedText={subRecipe ? ingredient.name : undefined}
                        onLinkedTextPress={subRecipe ? () => scrollToSubRecipe(subRecipe.title) : undefined}
                        useQuantityText={ingredient.useQuantityText}
                      />
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}

        {/* Title sits outside/above the list (same sectionTitle style
            as "What you'll need"). Anabelle's call: each step is its
            own numbered white card (ACCENT circle badge + text) rather
            than plain numbered lines inside one shared bordered card --
            no bounding maxHeight/nested scroll needed anymore either,
            since the steps just flow with the page's own scroll now. */}
        <Text style={styles.sectionTitle}>Instructions</Text>
        <View style={styles.instructionStepsList}>
          {meal.instructions.map((step, index) => (
            <View key={step} style={styles.instructionStepCard}>
              <View style={styles.instructionStepBadge}>
                <Text style={styles.instructionStepBadgeText}>{index + 1}</Text>
              </View>
              <Text style={styles.instructionStepText}>{step}</Text>
            </View>
          ))}
        </View>

        {/* Own bordered/tinted card now (Anabelle's call, with a design
            reference) -- label replaces the plain "Optional" sectionTitle
            used elsewhere on this page, so this reads as a distinct
            callout rather than another list section. */}
        {meal.optionalAdditions.length > 0 && (
          <View style={styles.optionalCard}>
            <View style={styles.optionalHeadingRow}>
              <Text style={styles.optionalHeading}>Optional</Text>
            </View>
            <View style={styles.optionalList}>
              {meal.optionalAdditions.map((addition, index) => (
                <Text key={addition.title || index} style={styles.optionalText}>
                  {/* A blank title (Anabelle's call for some additions --
                      description-only, no label) skips the title Text and
                      its trailing spacer entirely, instead of leaving a
                      stray leading gap before the description. */}
                  {addition.title ? (
                    <>
                      <Text style={styles.optionalTitle}>{addition.title}</Text>
                      {'  '}
                    </>
                  ) : null}
                  {addition.description}
                </Text>
              ))}
            </View>
          </View>
        )}

        {/* Standalone prep techniques linked from an ingredient above
            (see the "pork belly" example this was built for) -- one
            section per relevant sub-recipe, at the very bottom of the
            page. onLayout (on the outer wrapper, so the eyebrow label
            scrolls into view too, not just the card) captures each
            section's own Y offset the moment it renders, so
            scrollToSubRecipe (triggered by tapping the linked
            ingredient) has something to scroll to; no offset is known
            until then, so the jump link is a no-op on the very first
            render frame only. Collapsible (Anabelle's call, with a
            design reference) -- defaults open so the jump link still
            lands on visible content; the chevron just lets you tuck it
            away afterward. */}
        {meal.subRecipes.map((subRecipe) => (
          <View
            key={subRecipe.title}
            onLayout={(e) =>
              setSubRecipeOffsets((prev) => ({ ...prev, [subRecipe.title]: e.nativeEvent.layout.y }))
            }
          >
            <View style={styles.companionEyebrowRow}>
              <Text style={styles.companionEyebrowText}>Companion Recipe</Text>
            </View>
            <SubRecipeCard
              subRecipe={subRecipe}
              expanded={isSubRecipeExpanded(subRecipe.title)}
              onToggle={() => toggleSubRecipe(subRecipe.title)}
            />
          </View>
        ))}
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
  headerText: { marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  subtitle: { fontSize: 14, color: INK },
  // Floats over the ScrollView (position: absolute, sibling of it
  // rather than a row above it) and stays fixed on screen as content
  // scrolls underneath -- no opaque container/bar behind it, just the
  // circle itself. Solid white fill (not the earlier translucent
  // #ffffffcc) so the icon stays legible against whatever scrolls
  // behind it.
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // paddingTop clears the floating close button so the title doesn't
  // scroll up underneath it before the page has scrolled at all.
  scrollContent: { paddingHorizontal: 20, paddingTop: 64, paddingBottom: 40, gap: 4 },
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
  // mealCard, LegalDocumentModal.tsx). Deal items and staples share
  // one card -- see the two conditionally-rendered sections inside it.
  // Plain View now (was a ScrollView with its own maxHeight) -- a long
  // combined list just flows with the page's own scroll instead of
  // scrolling within its own bounded height (Anabelle's call, same
  // change already made to Instructions).
  ingredientsModalCard: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 16,
    padding: 14,
  },
  // Only when the pantry section follows the deal-items section within
  // the shared card: dealIngredientsList's own bottom item has no
  // trailing margin of its own, so without this the two sections'
  // headings would sit right on top of each other.
  pantrySectionStacked: { marginTop: 16 },
  // Rule between the deal-items section and the pantry section (only
  // rendered when both are present -- same condition as
  // pantrySectionStacked). marginBottom spaces it from the pantry
  // heading below; pantrySectionStacked's own marginTop already spaces
  // it from the deal items above.
  sectionDivider: { height: 1, backgroundColor: '#E8E8E8', marginBottom: 16 },
  // "From your pantry" only now -- Instructions' title moved outside
  // its card (see sectionTitle usage below), so this is the only
  // remaining innerSectionTitleFirst usage.
  innerSectionTitleFirst: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', marginBottom: 8 },
  // Leading-icon row shared by both card headings ("On Sale This Week"
  // and "From your pantry") -- icon sized/colored inline at the call
  // site (ShoppingModeIcon/ChefHatIcon, size 18, INK). marginBottom
  // lives here (not on the text) so alignItems: center centers the
  // icon against the text's actual content box -- putting marginBottom
  // on the text instead skewed its margin box taller on one side only,
  // throwing off the centering.
  innerHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  // "From your pantry" only -- cancels innerSectionTitleFirst's own
  // marginBottom, now carried by innerHeadingRow instead (see above).
  headingRowTextReset: { marginBottom: 0 },
  // "On Sale This Week" only -- its own style rather than a variant of
  // innerSectionTitleFirst, since that style is shared with "From your
  // pantry", which keeps its existing bold-black look. Back to plain
  // case/black/16px after trying small-caps/all-caps/gray -- just the
  // leading icon now, no other differentiator.
  dealsHeading: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  dealIngredientsList: { gap: 10 },
  // Thin rule between deal items (not before the first) -- items no
  // longer have their own bordered card each (see IngredientRow's
  // dealItemRow), so this is the only visual separation between them
  // inside the shared "On Sale This Week" card.
  dealDivider: { height: 1, backgroundColor: '#E8E8E8', marginBottom: 10 },
  staplesList: { gap: 10 },
  // Instructions -- one numbered white card per step (Anabelle's call,
  // replacing a single shared bordered card of plain numbered lines).
  // No border and no shadow (unlike every other "modal treatment" card
  // on this page) -- just the white card's own contrast against the
  // peach page background, per Anabelle's call to drop the shadow.
  instructionStepsList: { gap: 12 },
  instructionStepCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
  },
  // ACCENT-filled circle, same orange as "Add to my list" -- reads as
  // the step's own number tag, not a generic bullet.
  instructionStepBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionStepBadgeText: { fontSize: 15, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  instructionStepText: { flex: 1, fontSize: 15, lineHeight: 22, color: '#333' },
  // Sub-recipe Instructions only now (main recipe's own switched to
  // instructionStepCard above).
  listItem: { fontSize: 15, lineHeight: 24, color: '#333' },
  // Callout card (Anabelle's call, with a design reference) -- no fill,
  // just an outline in the app's fair-price/badge orange (#FF7A2A) to
  // read as its own card against the page's peach background; a plain
  // white "modal treatment" card (this page's usual convention) would
  // have read as just another priced section, which this deliberately
  // isn't.
  optionalCard: {
    borderWidth: 1.5,
    borderColor: '#FF7A2A',
    borderRadius: 20,
    padding: 20,
    marginTop: 16,
  },
  optionalHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  optionalHeading: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'OpenSans_800ExtraBold',
    color: INK,
    letterSpacing: 1,
  },
  // Not a priced ingredient list -- a short paragraph per suggestion,
  // title inline-bolded rather than styled as its own list row, so it
  // reads as "here's an idea" rather than "here's what to buy."
  optionalList: { gap: 12 },
  optionalText: { fontSize: 15, lineHeight: 24, color: '#333' },
  // Plain weight now (Anabelle's call) -- title still leads the
  // description inline, just no longer bolded/visually distinguished
  // from it.
  optionalTitle: { color: INK },
  // Sub-recipe sections (e.g. "Basic Crispy Pork Belly") at the very
  // bottom of the page, jump-linked from a matching ingredient above --
  // "Companion Recipe" eyebrow label sits outside/above a dashed-border
  // card (Anabelle's call, with a design reference). Eyebrow styled
  // identically to the Optional card's own heading (same size/weight/
  // color/letter-spacing) so the two callouts read as a matched pair;
  // card itself now black-bordered/white-filled like every other
  // "modal treatment" card on this page, dashed being the only
  // remaining thing that sets it apart (borrowed content, not authored
  // fresh for this recipe).
  companionEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 8 },
  companionEyebrowText: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'OpenSans_800ExtraBold',
    color: INK,
    letterSpacing: 1,
  },
  notFound: { padding: 24, fontSize: 15, color: '#888' },
});
