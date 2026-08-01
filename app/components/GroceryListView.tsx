import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { type Deal, MIN_DISPLAYED_DISCOUNT_PCT, fetchAllDeals, fetchDealsByIds, matchItemStore } from '../lib/curatedDeals';
import type { DealTag, Meal } from '../lib/mealData';
import { fetchRecipesByIds } from '../lib/recipes';
import { useSelectedDeals } from '../lib/selectedDeals';
import { useSelectedMeals } from '../lib/selectedMeals';

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
  const [selectedMeals, setSelectedMeals] = useState<Meal[]>([]);
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
      setSelectedMeals([]);
      return;
    }
    fetchRecipesByIds(Array.from(selectedIds))
      .then(setSelectedMeals)
      .catch(() => setSelectedMeals([]));
  }, [selectedIds]);

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
    return meal.ingredients.map((ingredient, index) => ({
      key: `${meal.id}-${index}`,
      // The grocery list shows what to actually buy, not what the dish
      // uses once prepared -- for a cooked-yield staple like rice, that's
      // the dry-equivalent amount (see lib/unitConversion.ts
      // describeDryEquivalent), not the recipe's cooked-quantity text.
      // The recipe page keeps showing the cooked text unchanged.
      text: ingredient.groceryText ?? ingredient.text,
      source: meal.name,
      dealTag: ingredient.dealTag,
      estimatedPrice: ingredient.estimatedPrice,
      // Only a real match against this week's flyers earns a store --
      // never guessed from "well you're already buying other stuff at
      // Store X for this recipe." A true pantry staple with no flyer
      // presence belongs in "Other items", not implied to be at a store
      // we have no actual data for.
      store: ingredient.dealTag?.store ?? matchItemStore(ingredient.name, allDeals),
      multiplier,
    }));
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
  const itemsWithDeal = items.filter((item) => item.dealTag);
  const dealItemCount = itemsWithDeal.length;

  // Total price: each recipe's own price-per-serving x its servings x how
  // many times it's being made, plus each standalone deal's real price --
  // never a fabricated per-ingredient split, since recipes don't have
  // itemized ingredient prices.
  const recipesTotalPrice = selectedMeals.reduce((sum, meal) => {
    const multiplier = multipliers.get(meal.id) ?? 1;
    return sum + meal.price * meal.servings * multiplier;
  }, 0);
  const dealsTotalPrice = selectedDeals.reduce((sum, deal) => sum + deal.price, 0);
  const totalPrice = recipesTotalPrice + dealsTotalPrice;

  // Regular (pre-discount) total: real original_price for standalone deals
  // -- recipes don't have a comparable original price on file (their
  // estimate is a single AI-generated per-serving figure, not itemized
  // per ingredient), so they contribute the same number to both totals
  // rather than an invented markup.
  const dealsTotalOriginalPrice = selectedDeals.reduce((sum, deal) => sum + deal.originalPrice, 0);
  const totalOriginalPrice = recipesTotalPrice + dealsTotalOriginalPrice;

  // Average saving: the mean discount_pct across items actually tied to a
  // real flyer deal -- a dollar-savings total isn't knowable since recipes
  // don't carry a pre-discount "original price" to compare against.
  const avgSavingsPct =
    itemsWithDeal.length > 0
      ? itemsWithDeal.reduce((sum, item) => sum + (item.dealTag?.discountPct ?? 0), 0) /
        itemsWithDeal.length
      : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Grocery list</Text>
        <Text style={styles.subtitle}>
          {items.length} item{items.length === 1 ? '' : 's'} · {dealItemCount} on sale ·{' '}
          {storeNames.filter((s) => s !== OTHER_ITEMS).length} store
          {storeNames.filter((s) => s !== OTHER_ITEMS).length === 1 ? '' : 's'}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {selectedMeals.length === 0 && selectedDeals.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              Nothing here yet. Add recipes from Meals or deals from Best Deals to build your list.
            </Text>
          </View>
        )}

        {selectedMeals.length > 0 && (
          <View style={styles.selectedSection}>
            <Text style={styles.selectedSectionTitle}>Selected recipes</Text>
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
                      <Text style={styles.iconButton}>✕</Text>
                    </Pressable>
                  </View>
                  <View style={styles.stepperRow}>
                    <Pressable
                      style={[styles.stepperButton, multiplier === 1 && styles.stepperButtonDisabled]}
                      onPress={() => adjustMultiplier(meal.id, -1)}
                      disabled={multiplier === 1}
                      hitSlop={8}
                    >
                      <Text style={styles.stepperButtonText}>−</Text>
                    </Pressable>
                    <Text style={styles.stepperValue}>
                      {totalServings} serving{totalServings === 1 ? '' : 's'}
                    </Text>
                    <Pressable
                      style={styles.stepperButton}
                      onPress={() => adjustMultiplier(meal.id, 1)}
                      hitSlop={8}
                    >
                      <Text style={styles.stepperButtonText}>+</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {storeNames.map((store) => (
          <View key={store} style={styles.storeSection}>
            <Text style={styles.storeName}>{store}</Text>
            {storeGroups.get(store)!.map((item) => {
              const isChecked = checked.has(item.key);
              return (
                <View key={item.key} style={styles.itemRow}>
                  <Pressable
                    style={[styles.checkbox, isChecked && styles.checkboxChecked]}
                    onPress={() => toggleChecked(item.key)}
                    hitSlop={8}
                  >
                    {isChecked && <Text style={styles.checkboxMark}>✓</Text>}
                  </Pressable>
                  {item.dealTag?.imageUrl && (
                    <Image source={{ uri: item.dealTag.imageUrl }} style={styles.itemImage} />
                  )}
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemName, isChecked && styles.itemNameChecked]}>
                      {item.text}
                    </Text>
                    <Text style={styles.itemMeta}>{item.source}</Text>
                    {item.dealTag?.quantityEstimated && (
                      <Text style={styles.estimatedDisclaimer}>*Quantity is estimated. See store</Text>
                    )}
                  </View>
                  <View style={styles.itemRightColumn}>
                    {!!item.multiplier && item.multiplier > 1 && (
                      <View style={styles.multiplierBadge}>
                        <Text style={styles.multiplierBadgeText}>×{item.multiplier}</Text>
                      </View>
                    )}
                    {item.dealTag?.price != null && (
                      <View style={styles.itemPriceRow}>
                        <Text style={styles.itemPriceValue}>${item.dealTag.price.toFixed(2)}</Text>
                        {item.dealTag.originalPrice != null &&
                          item.dealTag.originalPrice > item.dealTag.price &&
                          item.dealTag.discountPct >= MIN_DISPLAYED_DISCOUNT_PCT && (
                            <Text style={styles.itemPriceOriginal}>
                              ${item.dealTag.originalPrice.toFixed(2)}
                            </Text>
                          )}
                      </View>
                    )}
                    {!item.dealTag && item.estimatedPrice && (
                      <Text style={styles.itemPriceEstimated}>
                        {`$${item.estimatedPrice.avgPrice.toFixed(2)} avg.`}
                      </Text>
                    )}
                    {item.dealTag && item.dealTag.discountPct >= MIN_DISPLAYED_DISCOUNT_PCT && (
                      <View style={styles.discountBadge}>
                        <Text style={styles.discountBadgeText}>Up to {item.dealTag.discountPct}% off</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ))}

        {items.length > 0 && (
          <View style={styles.totalSection}>
            {totalOriginalPrice > totalPrice && (
              <Text style={styles.regularPriceLine}>
                Regular price:{' '}
                <Text style={styles.regularPriceStrike}>${totalOriginalPrice.toFixed(2)}</Text>
              </Text>
            )}
            <View style={styles.totalCard}>
              <View style={styles.totalTextBlock}>
                <Text style={styles.totalLabel}>Total</Text>
                {dealItemCount > 0 && (
                  <Text style={styles.totalSublabel}>
                    Avg. {Math.round(avgSavingsPct)}% off on {dealItemCount} deal item
                    {dealItemCount === 1 ? '' : 's'}
                  </Text>
                )}
              </View>
              <Text style={styles.totalValue}>${totalPrice.toFixed(2)}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 20, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 13, color: '#888', marginTop: 2 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 20 },
  emptyState: { backgroundColor: '#F2F2F2', borderRadius: 14, padding: 20 },
  emptyStateText: { color: '#666', fontSize: 14, textAlign: 'center' },
  selectedSection: { gap: 10 },
  selectedSectionTitle: { fontSize: 15, fontWeight: '700' },
  selectedRow: {
    gap: 10,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  selectedRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectedRowInfo: { flex: 1 },
  selectedRowName: { fontSize: 14, fontWeight: '600' },
  selectedRowMeta: { fontSize: 12, color: '#999', marginTop: 2 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
  stepperButtonText: { fontSize: 16, fontWeight: '700' },
  stepperValue: { fontSize: 13, color: '#666', fontWeight: '600' },
  storeSection: { gap: 10 },
  storeName: { fontSize: 15, fontWeight: '700' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#111', borderColor: '#111' },
  checkboxMark: { fontSize: 12, fontWeight: '700', color: '#fff' },
  itemImage: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#F2F2F2' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15 },
  itemNameChecked: { textDecorationLine: 'line-through', color: '#aaa' },
  itemMeta: { fontSize: 12, color: '#999', marginTop: 1 },
  estimatedDisclaimer: { fontSize: 11, color: '#B8860B', fontStyle: 'italic', marginTop: 2 },
  itemRightColumn: { alignItems: 'flex-end', gap: 6 },
  itemPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  itemPriceValue: { fontSize: 14, fontWeight: '800' },
  itemPriceOriginal: { fontSize: 11, color: '#aaa', textDecorationLine: 'line-through' },
  itemPriceEstimated: { fontSize: 12, color: '#888' },
  discountBadge: { backgroundColor: '#2C5FD6', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  discountBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  multiplierBadge: { backgroundColor: '#F2F2F2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  multiplierBadgeText: { color: '#666', fontSize: 11, fontWeight: '800' },
  iconButton: { fontSize: 14, color: '#999', paddingHorizontal: 4 },
  totalSection: { gap: 6 },
  regularPriceLine: { fontSize: 13, color: '#999', textAlign: 'right' },
  regularPriceStrike: { textDecorationLine: 'line-through' },
  totalCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 14,
    padding: 16,
  },
  totalTextBlock: { flex: 1, marginRight: 12 },
  totalLabel: { fontSize: 16, fontWeight: '700' },
  totalSublabel: { fontSize: 13, color: '#888', marginTop: 2 },
  totalValue: { fontSize: 24, fontWeight: '800' },
});
