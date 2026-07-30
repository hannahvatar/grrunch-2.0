import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { type Deal, fetchDealsByIds } from '../lib/curatedDeals';
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
  multiplier?: number;
}

function mapDealToGroceryItem(deal: Deal): GroceryItem {
  return {
    key: `deal-${deal.id}`,
    text: deal.itemName,
    source: 'Best Deal',
    dealTag: {
      name: deal.itemName,
      discountPct: Math.round(deal.discountPct),
      store: deal.chainName,
      imageUrl: deal.imageUrl ?? undefined,
    },
  };
}

function groupByStore(items: GroceryItem[]): Map<string, GroceryItem[]> {
  const groups = new Map<string, GroceryItem[]>();
  for (const item of items) {
    const store = item.dealTag?.store ?? OTHER_ITEMS;
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
// grouped by the store its deal came from (so a shopping trip maps to one
// section per stop). Ingredients with no flyer deal behind them (pantry
// staples) fall into "Other items".
export function GroceryListView() {
  const { selectedIds, toggleSelected } = useSelectedMeals();
  const { selectedDealIds } = useSelectedDeals();
  const [selectedMeals, setSelectedMeals] = useState<Meal[]>([]);
  const [selectedDeals, setSelectedDeals] = useState<Deal[]>([]);
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
      text: ingredient.text,
      source: meal.name,
      dealTag: ingredient.dealTag,
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
  const dealItemCount = items.filter((item) => item.dealTag).length;

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
                    {item.dealTag && (
                      <View style={styles.discountBadge}>
                        <Text style={styles.discountBadgeText}>-{item.dealTag.discountPct}%</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
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
  discountBadge: { backgroundColor: '#2C5FD6', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  discountBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  multiplierBadge: { backgroundColor: '#F2F2F2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  multiplierBadgeText: { color: '#666', fontSize: 11, fontWeight: '800' },
  iconButton: { fontSize: 14, color: '#999', paddingHorizontal: 4 },
});
