import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MapPinIcon, MinusIcon, PlusIcon, XMarkIcon } from 'react-native-heroicons/outline';

import { type Deal, fetchAllDeals, fetchDealsByIds, isReferencePriced, matchItemStore } from '../lib/curatedDeals';
import { IngredientRow } from './IngredientRow';
import type { DealTag, Meal } from '../lib/mealData';
import { scaleIngredientDisplay } from '../lib/mealScaling';
import { fetchRecipesByIds } from '../lib/recipes';
import { useSelectedDeals } from '../lib/selectedDeals';
import { useSelectedMeals } from '../lib/selectedMeals';

// Same visual language as the recipe page (app/recipe.tsx) -- peach
// background, bold 2px-black-border white "modal treatment" cards, INK
// text throughout instead of grey secondary text. Pulled over directly
// (Anabelle's request) since the two screens share the same ingredient
// rows (IngredientRow) but had drifted to two different card/border/
// color languages -- this screen was plainer (white bg, thin #eee
// borders) while the recipe page had since been polished. No ACCENT
// constant here (unlike recipe.tsx) -- this screen has no equivalent
// primary-action button to apply it to.
const INK = '#111';

const OTHER_ITEMS = 'Other items';

interface GroceryItem {
  key: string;
  text: string;
  source: string;
  dealTag?: DealTag;
  estimatedPrice?: { avgPrice: number; unit: string; source: 'statcan' | 'produce' | 'staple' };
  multiplier?: number;
  // The store this item is grouped under -- only ever set from a real
  // match (either the ingredient's own deal, or, for non-deal
  // ingredients, a genuine match against this week's flyers -- see
  // lib/curatedDeals.ts matchItemStore). Never guessed from "well this
  // recipe's other ingredients are at Store X" -- a true pantry staple
  // with no flyer presence stays in "Other items" rather than implying a
  // store we have no data for.
  store?: string;
}

function mapDealToGroceryItem(deal: Deal): GroceryItem {
  return {
    key: `deal-${deal.id}`,
    text: deal.itemName,
    source: 'Best Deal',
    store: deal.chainName,
    dealTag: {
      name: deal.itemName,
      discountPct: Math.round(deal.discountPct),
      price: deal.price,
      originalPrice: deal.originalPrice,
      store: deal.chainName,
      imageUrl: deal.imageUrl ?? undefined,
      originalPriceSource: deal.originalPriceSource,
    },
  };
}

function groupByStore(items: GroceryItem[]): Map<string, GroceryItem[]> {
  const groups = new Map<string, GroceryItem[]>();
  for (const item of items) {
    const store = item.store ?? OTHER_ITEMS;
    const existing = groups.get(store);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(store, [item]);
    }
  }
  return groups;
}

// Grocery tab — every ingredient from the recipes checked off in Meals,
// grouped by the store it's actually available at this week (its own deal,
// or a real match against the current flyers for non-deal ingredients).
// A true pantry staple with no flyer presence falls into "Other items"
// rather than being guessed into whichever store the rest of its recipe
// happens to be at.
export function GroceryListView() {
  const { selectedIds, toggleSelected } = useSelectedMeals();
  const { selectedDealIds } = useSelectedDeals();
  const [rawSelectedMeals, setRawSelectedMeals] = useState<Meal[]>([]);
  const [selectedDeals, setSelectedDeals] = useState<Deal[]>([]);
  // This week's full deal list, used only to look up which store carries a
  // non-deal ingredient (e.g. "Watermelon" -> T&T) -- separate from
  // dealTags/price crediting, see lib/curatedDeals.ts matchItemStore.
  const [allDeals, setAllDeals] = useState<Deal[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  // How many times to make each recipe (1 = the recipe's real serving
  // count as-is, 2 = double the ingredients, etc.) -- multiples of the
  // recipe's own yield, not an arbitrary serving count.
  const [multipliers, setMultipliers] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (selectedIds.size === 0) {
      setRawSelectedMeals([]);
      return;
    }
    fetchRecipesByIds(Array.from(selectedIds))
      .then(setRawSelectedMeals)
      .catch(() => setRawSelectedMeals([]));
  }, [selectedIds]);

  // Each recipe's real, un-scaled serving size/price/nutrition -- see
  // lib/mealScaling.ts for why nothing here gets resized to a target.
  const selectedMeals = rawSelectedMeals;

  useEffect(() => {
    if (selectedDealIds.size === 0) {
      setSelectedDeals([]);
      return;
    }
    fetchDealsByIds(Array.from(selectedDealIds))
      .then(setSelectedDeals)
      .catch(() => setSelectedDeals([]));
  }, [selectedDealIds]);

  useEffect(() => {
    fetchAllDeals()
      .then(setAllDeals)
      .catch(() => setAllDeals([]));
  }, []);

  function toggleChecked(itemKey: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(itemKey)) {
        next.delete(itemKey);
      } else {
        next.add(itemKey);
      }
      return next;
    });
  }

  function adjustMultiplier(mealId: string, delta: number) {
    setMultipliers((prev) => {
      const next = new Map(prev);
      const current = next.get(mealId) ?? 1;
      next.set(mealId, Math.max(1, current + delta));
      return next;
    });
  }

  const recipeItems: GroceryItem[] = selectedMeals.flatMap((meal) => {
    const multiplier = multipliers.get(meal.id) ?? 1;
    return meal.ingredients.map((ingredient, index) => {
      // Deal-tagged lines never fragment -- 2x the recipe means buying 2
      // whole packages, shown as a x2 badge next to the unscaled "1
      // package ..." text. A staple's own quantity genuinely doubles, so
      // it's scaled directly into the text instead, with no badge (see
      // lib/mealScaling.ts scaleIngredientDisplay).
      const scaled = scaleIngredientDisplay(ingredient, multiplier);
      return {
        key: `${meal.id}-${index}`,
        // The grocery list shows what to actually buy, not what the dish
        // uses once prepared -- for a cooked-yield staple like rice, that's
        // the dry-equivalent amount (see lib/unitConversion.ts
        // describeDryEquivalent), not the recipe's cooked-quantity text.
        // The recipe page keeps showing the cooked text unchanged.
        text: scaled.groceryText ?? scaled.text,
        source: meal.name,
        dealTag: ingredient.dealTag,
        // ingredient.estimatedPrice is computed once against the recipe's
        // BASE (1x) stored quantity (see matchReferencePrice in
        // lib/staplePrices.ts) and never itself knows about this list's
        // batch multiplier -- unlike scaled.groceryText above, which
        // already reflects it. Multiply here so the displayed "$X avg."
        // actually matches the (already-scaled) quantity text sitting
        // right next to it, instead of silently staying frozen at the
        // 1x amount while everything around it doubles.
        estimatedPrice: ingredient.estimatedPrice
          ? { ...ingredient.estimatedPrice, avgPrice: ingredient.estimatedPrice.avgPrice * multiplier }
          : undefined,
        // Only a real match against this week's flyers earns a store --
        // never guessed from "well you're already buying other stuff at
        // Store X for this recipe." A true pantry staple with no flyer
        // presence belongs in "Other items", not implied to be at a store
        // we have no actual data for.
        store: ingredient.dealTag?.store ?? matchItemStore(ingredient.name, allDeals),
        multiplier: ingredient.dealTag ? multiplier : undefined,
      };
    });
  });
  const dealItems: GroceryItem[] = selectedDeals.map(mapDealToGroceryItem);
  const items: GroceryItem[] = [...recipeItems, ...dealItems];
  const storeGroups = groupByStore(items);
  const storeNames = Array.from(storeGroups.keys())
    .filter((store) => store !== OTHER_ITEMS)
    .sort();
  if (storeGroups.has(OTHER_ITEMS)) {
    storeNames.push(OTHER_ITEMS);
  }
  // A reference-sourced deal tag never counts as "on sale" here -- its
  // discountPct isn't a claim the store made (see
  // lib/curatedDeals.ts's isReferencePriced()).
  const itemsWithDeal = items.filter((item) => item.dealTag && !isReferencePriced(item.dealTag.originalPriceSource));
  const dealItemCount = itemsWithDeal.length;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Scrolls away with the rest of the content now, matching
            recipe.tsx's own headerText (also the first thing inside its
            ScrollView, not a fixed sibling above it) -- was previously a
            fixed header sitting outside the ScrollView entirely. */}
        <View style={styles.header}>
          <Text style={styles.title}>Grocery list</Text>
          <Text style={styles.subtitle}>
            {items.length} item{items.length === 1 ? '' : 's'} · {dealItemCount} on sale ·{' '}
            {storeNames.filter((s) => s !== OTHER_ITEMS).length} store
            {storeNames.filter((s) => s !== OTHER_ITEMS).length === 1 ? '' : 's'}
          </Text>
        </View>
        {selectedMeals.length === 0 && selectedDeals.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              Nothing here yet. Add recipes from Meals or deals from Best Deals to build your list.
            </Text>
          </View>
        )}

        {selectedMeals.length > 0 && (
          <View style={styles.selectedSection}>
            <Text style={styles.selectedSectionTitle}>Selected Meals</Text>
            {selectedMeals.map((meal) => {
              const multiplier = multipliers.get(meal.id) ?? 1;
              const totalServings = meal.servings * multiplier;
              return (
                <View key={meal.id} style={styles.selectedRow}>
                  <View style={styles.selectedRowTop}>
                    <Pressable
                      style={styles.selectedRowInfo}
                      onPress={() => router.push({ pathname: '/recipe', params: { id: meal.id } })}
                    >
                      <Text style={styles.selectedRowName}>{meal.name}</Text>
                      <Text style={styles.selectedRowMeta}>${meal.price.toFixed(2)} / serving</Text>
                    </Pressable>
                    <Pressable onPress={() => toggleSelected(meal.id)} hitSlop={8}>
                      <XMarkIcon size={16} color="#999" />
                    </Pressable>
                  </View>
                  <View style={styles.stepperRow}>
                    <Pressable
                      style={[styles.stepperButton, multiplier === 1 && styles.stepperButtonDisabled]}
                      onPress={() => adjustMultiplier(meal.id, -1)}
                      disabled={multiplier === 1}
                      hitSlop={8}
                    >
                      <MinusIcon size={14} color="#111" />
                    </Pressable>
                    <Text style={styles.stepperValue}>
                      {totalServings} serving{totalServings === 1 ? '' : 's'}
                    </Text>
                    <Pressable
                      style={styles.stepperButton}
                      onPress={() => adjustMultiplier(meal.id, 1)}
                      hitSlop={8}
                    >
                      <PlusIcon size={14} color="#111" />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {storeNames.map((store) => (
          <View key={store} style={styles.storeCard}>
            <View style={styles.storeHeadingRow}>
              <MapPinIcon size={18} color={INK} />
              <Text style={styles.storeName}>{store}</Text>
            </View>
            {storeGroups.get(store)!.map((item) => (
              <IngredientRow
                key={item.key}
                text={item.text}
                dealTag={item.dealTag}
                estimatedPrice={item.estimatedPrice}
                meta={item.source}
                checked={checked.has(item.key)}
                onToggleCheck={() => toggleChecked(item.key)}
                multiplier={item.multiplier}
                // Deal-tagged rows only -- same blurred-backdrop/
                // stacked treatment as the recipe page's own "On Sale
                // This Week" deal items (Anabelle's ask), so a deal
                // item reads the same wherever it shows up -- image at
                // half that page's 88px (this list has more rows
                // competing for vertical space than one recipe's own
                // ingredient card does). Staple ("Other items") rows
                // keep the plain default layout -- stackedLayout's
                // price row only ever renders a dealTag's price/
                // badges, so applying it to a non-deal row would
                // silently drop its "$X avg." estimate entirely. No
                // showStoreLink here even for deal rows -- unlike the
                // recipe page, this screen already groups by store as
                // its own section heading, so repeating the store name
                // per-row would be redundant (see IngredientRow's own
                // showStoreLink prop comment).
                imageSize={item.dealTag ? 44 : undefined}
                blurredBackdrop={!!item.dealTag}
                stackedLayout={!!item.dealTag}
              />
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Matches recipe.tsx's own container -- this screen is a peer of the
  // recipe modal/Meals tab, not a separate white sheet.
  container: { flex: 1, backgroundColor: '#FFEAD4' },
  // No horizontal/bottom padding of its own anymore -- scrollContent's
  // own paddingHorizontal and gap (between it and the next child) cover
  // that now that header lives inside the ScrollView. paddingTop alone
  // remains, for clearance below the screen's top edge/notch.
  header: { paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  subtitle: { fontSize: 13, color: INK, marginTop: 2 },
  // paddingBottom is generous (not the usual ~40) so the last store
  // card's own right-aligned price never lands under SupportBubble -- a
  // fixed floating chat button rendered globally in _layout.tsx at
  // right:20/bottom:96 (52px tall), which otherwise sits directly on top
  // of this screen's last/bottom-most content when scrolled all the way
  // down (originally confirmed against the since-removed Total card;
  // the same risk applies to whichever card is now genuinely last).
  scrollContent: { paddingHorizontal: 20, paddingBottom: 140, gap: 20 },
  emptyState: { backgroundColor: '#fff', borderWidth: 2, borderColor: INK, borderRadius: 16, padding: 20 },
  emptyStateText: { color: INK, fontSize: 14, textAlign: 'center' },
  selectedSection: { gap: 10 },
  selectedSectionTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  // "Modal treatment" card -- same white/2px-black-border/16px-radius
  // language as recipe.tsx's ingredientsModalCard/instructionsCard.
  selectedRow: {
    gap: 10,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 16,
    padding: 14,
  },
  selectedRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectedRowInfo: { flex: 1 },
  selectedRowName: { fontSize: 14, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold', color: INK },
  selectedRowMeta: { fontSize: 12, color: INK, marginTop: 2 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Bold INK-bordered circle, matching recipe.tsx's own servings
  // stepper (was a thin #ddd/1px border, the plainer pre-pull look).
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
  stepperValue: { fontSize: 13, color: INK, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  // Each store group gets its own "modal treatment" card (same
  // language as recipe.tsx's ingredientsModalCard) with an icon-led
  // heading (MapPinIcon -- same icon location.tsx uses for "Find deals
  // near you", reused here so a store name reads the same way
  // wherever it shows up) instead of the previous plain bold-text-only
  // label on a bare background.
  storeCard: {
    gap: 10,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 16,
    padding: 14,
  },
  storeHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  storeName: { fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
});
