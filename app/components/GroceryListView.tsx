import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowPathIcon, MapPinIcon, MinusIcon, PlusIcon, XMarkIcon } from 'react-native-heroicons/outline';

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
// borders) while the recipe page had since been polished.
const INK = '#111';
// Used once, on the quantity-edit sheet's Done button -- that sheet is
// now this screen's one real primary action, same brand accent
// recipe.tsx uses for its own "Add to my list" button.
const ACCENT = '#FFA955';

const OTHER_ITEMS = 'Other items';

interface GroceryItem {
  key: string;
  text: string;
  source: string;
  dealTag?: DealTag;
  multiplier?: number;
  // Recipe items only (see recipeItems below) -- the real per-batch
  // quantity/unit IngredientRow's package-count badge needs to tell a
  // fragmented deal item from a non-fragmented one when `multiplier` is
  // set. A standalone Best-Deals item (mapDealToGroceryItem) has no
  // recipe context and never sets `multiplier` at all, so it leaves
  // these undefined.
  quantity?: string;
  unit?: string;
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
    // Leading "1 " token is required, not decorative -- IngredientRow's
    // stackedLayout (used below via `stackedLayout={!!item.dealTag}`)
    // always splits `text` on its first space to derive the quantity
    // badge, same convention every recipe-sourced ingredient's own text
    // already follows (e.g. "1 package ..."). Without it, deal.itemName's
    // own first word (e.g. "Small" in "Small Bar Cakes") got treated as
    // the quantity and silently clipped off the displayed name.
    text: `1 ${deal.itemName}`,
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
  // Items the shopper has manually removed from their own list --
  // doesn't touch selectedMeals/selectedDeals at all (removing one
  // ingredient from view doesn't un-select its whole recipe). Keyed by
  // the same stable item.key (`${meal.id}-${index}` / `deal-${id}`)
  // used everywhere else on this screen, so a removal survives re-
  // renders from other state changes (checking a box, adjusting a
  // multiplier) for as long as this screen stays mounted -- same
  // session-only lifetime as every other piece of state here (checked,
  // multipliers), none of it persists across a reload today.
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set());
  // Manual quantity edits, same key space as removedKeys above.
  // Deliberately display-only (Anabelle's call) -- editing never
  // recomputes price, which is also why estimatedPrice's "$X avg." is
  // no longer shown on this screen at all (see the IngredientRow call
  // below): once quantity is something the shopper can freely change,
  // continuing to show a price computed from the ORIGINAL quantity
  // would read as if it still applied to the edited amount. The
  // recipe page is unaffected -- it still passes estimatedPrice.
  const [quantityOverrides, setQuantityOverrides] = useState<Map<string, string>>(new Map());
  // The single shared quantity-edit bottom sheet -- one instance for
  // the whole screen (not one per row) opened via any row's pencil
  // icon. null = closed. sheetQuantityDraft is the stepper/input's
  // live value while the sheet is open.
  const [editingItem, setEditingItem] = useState<GroceryItem | null>(null);
  const [sheetQuantityDraft, setSheetQuantityDraft] = useState('');

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

  function removeItem(itemKey: string) {
    setRemovedKeys((prev) => new Set(prev).add(itemKey));
  }

  // Drops this item's override entirely -- resolveDisplayText then falls
  // straight back to item.text, the live-computed (recipe baseline x
  // servings multiplier) amount, same as an item that was never edited.
  function resetQuantityOverride(itemKey: string) {
    setQuantityOverrides((prev) => {
      const next = new Map(prev);
      next.delete(itemKey);
      return next;
    });
  }

  // Bulk version of the above -- the top-of-screen note's own "Reset"
  // button, for clearing every manual edit at once rather than one item
  // at a time via each row's own sheet.
  function resetAllQuantityOverrides() {
    setQuantityOverrides(new Map());
  }

  function resolveDisplayText(item: GroceryItem): string {
    return quantityOverrides.get(item.key) ?? item.text;
  }

  // Opens the shared sheet for this item, seeding the stepper/input
  // from whatever quantity is currently showing (an existing override,
  // if there is one, so re-opening the sheet doesn't lose an earlier
  // edit) -- same leading-token convention IngredientRow's own display
  // already uses (deal items: the quantity badge; staple items: the
  // first word of the line, e.g. "340" in "340 g Spaghetti").
  function openQuantityEditor(item: GroceryItem) {
    const [firstToken] = resolveDisplayText(item).split(' ');
    setSheetQuantityDraft(firstToken);
    setEditingItem(item);
  }

  function closeQuantityEditor() {
    setEditingItem(null);
    setSheetQuantityDraft('');
  }

  // Reconstructs the full text string with just its leading token
  // replaced -- both layouts' displayed quantity is that same leading
  // token (IngredientRow's stackedLayout re-derives its badge by
  // splitting `text` on the first space; the default layout's line
  // just IS "<quantity> <rest>"), so overwriting it here is the one
  // change needed regardless of item type. Always rebuilt from the
  // CURRENT resolved text (which already includes any earlier
  // override), so repeated edits keep composing correctly rather than
  // reverting to the original amount each time.
  function commitQuantityEditor() {
    if (!editingItem) return;
    const trimmed = sheetQuantityDraft.trim();
    if (trimmed) {
      const [, ...rest] = resolveDisplayText(editingItem).split(' ');
      setQuantityOverrides((prev) => new Map(prev).set(editingItem.key, [trimmed, ...rest].join(' ')));
    }
    closeQuantityEditor();
  }

  // Stepper +/- -- operates on whatever's currently typed in the
  // input, parsed as a number; non-numeric input (a shopper mid-typing
  // a fraction, or having cleared the field) just leaves the stepper a
  // no-op rather than guessing -- the field itself is still free-typed
  // via the keyboard regardless.
  function adjustSheetQuantity(delta: number) {
    const current = parseFloat(sheetQuantityDraft);
    if (Number.isNaN(current)) return;
    const next = Math.max(0, Math.round((current + delta) * 100) / 100);
    setSheetQuantityDraft(String(next));
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
      const key = `${meal.id}-${index}`;
      return {
        key,
        // The grocery list shows what to actually buy, not what the dish
        // uses once prepared -- for a cooked-yield staple like rice, that's
        // the dry-equivalent amount (see lib/unitConversion.ts
        // describeDryEquivalent), not the recipe's cooked-quantity text.
        // The recipe page keeps showing the cooked text unchanged.
        text: scaled.groceryText ?? scaled.text,
        source: meal.name,
        dealTag: ingredient.dealTag,
        // Only a real match against this week's flyers earns a store --
        // never guessed from "well you're already buying other stuff at
        // Store X for this recipe." A true pantry staple with no flyer
        // presence belongs in "Other items", not implied to be at a store
        // we have no actual data for.
        store: ingredient.dealTag?.store ?? matchItemStore(ingredient.name, allDeals),
        // Withheld once this item has a manual quantity override.
        // IngredientRow's dealQuantity badge folds `multiplier` directly
        // into the leading number of `text` for display, which is only
        // correct while that number is still the untouched recipe
        // baseline ("1 bunch..." always, regardless of batch size -- see
        // IngredientRow's own comment). Once quantityOverrides holds a
        // manually-typed ABSOLUTE amount for this key (e.g. "4"), that's
        // already the shopper's final answer -- folding the multiplier on
        // top of it would double-apply the scaling (a manual edit to "4"
        // must not silently become "8" just because servings doubled
        // afterward). An override stays fixed until the shopper edits it
        // again themselves.
        multiplier: ingredient.dealTag && !quantityOverrides.has(key) ? multiplier : undefined,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
      };
    });
  });
  const dealItems: GroceryItem[] = selectedDeals.map(mapDealToGroceryItem);
  // Removed items drop out here, before grouping/counting -- so "N
  // items"/"N stores" in the header, and which store cards even show
  // up, all reflect what's actually left on the list.
  const items: GroceryItem[] = [...recipeItems, ...dealItems].filter((item) => !removedKeys.has(item.key));
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
        {items.length > 0 && (
          <View style={styles.quantityNoteRow}>
            <Text style={styles.quantityNote}>
              Quantities shown reflect your selected recipes. You can manually edit them, or reset to
              the original amount.
            </Text>
            {/* Bulk version of each row's own sheet-level "Reset to
                original quantity" link. Always visible (not conditionally
                hidden) so the row's layout is stable -- disabled/dimmed
                instead once there's nothing to reset, same as the
                servings stepper's own disabled minus button. Same
                tertiary treatment (white fill, INK border) as
                IngredientRow's editButton/removeMealButton above. */}
            <Pressable
              style={[styles.resetAllButton, quantityOverrides.size === 0 && styles.resetAllButtonDisabled]}
              onPress={resetAllQuantityOverrides}
              disabled={quantityOverrides.size === 0}
              hitSlop={8}
            >
              <Text style={styles.resetAllButtonText}>Reset</Text>
              <ArrowPathIcon size={14} color={INK} />
            </Pressable>
          </View>
        )}
        {selectedMeals.length === 0 && selectedDeals.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              Nothing here yet. Add recipes from Meals or deals from Weekly Deals to build your list.
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
                    <Pressable style={styles.removeMealButton} onPress={() => toggleSelected(meal.id)} hitSlop={8}>
                      <XMarkIcon size={14} color={INK} />
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

        {/* Same title style as "Selected Meals" above -- this screen now
            reads as two clearly labeled sections (the recipes you've
            picked, then what to actually buy for them) instead of the
            store cards just starting with no heading of their own. */}
        {storeNames.length > 0 && <Text style={styles.selectedSectionTitle}>Your list</Text>}
        {storeNames.map((store) => (
          <View key={store} style={styles.storeCard}>
            <View style={styles.storeHeadingRow}>
              <MapPinIcon size={18} color={INK} />
              <Text style={styles.storeName}>{store}</Text>
            </View>
            {storeGroups.get(store)!.map((item) => (
              <IngredientRow
                key={item.key}
                text={resolveDisplayText(item)}
                dealTag={item.dealTag}
                // No estimatedPrice on this screen at all anymore
                // (Anabelle's call, alongside adding editing below) --
                // once quantity is something the shopper can freely
                // edit, a price computed from the original amount
                // would read as if it still applied. Recipe page is
                // unaffected, still passes its own estimatedPrice.
                meta={item.source}
                checked={checked.has(item.key)}
                onToggleCheck={() => toggleChecked(item.key)}
                multiplier={item.multiplier}
                quantity={item.quantity}
                unit={item.unit}
                // Deal-tagged rows only -- same blurred-backdrop/
                // stacked treatment as the recipe page's own "On Sale
                // This Week" deal items (Anabelle's ask), so a deal
                // item reads the same wherever it shows up -- image at
                // half that page's 88px (this list has more rows
                // competing for vertical space than one recipe's own
                // ingredient card does). Staple ("Other items") rows
                // keep the plain default layout -- stackedLayout's
                // price row only ever renders a dealTag's price/
                // badges, so applying it to a non-deal row would have
                // silently dropped its own price display. No
                // showStoreLink here even for deal rows -- unlike the
                // recipe page, this screen already groups by store as
                // its own section heading, so repeating the store name
                // per-row would be redundant (see IngredientRow's own
                // showStoreLink prop comment).
                imageSize={item.dealTag ? 44 : undefined}
                blurredBackdrop={!!item.dealTag}
                stackedLayout={!!item.dealTag}
                onRemove={() => removeItem(item.key)}
                onEditQuantity={() => openQuantityEditor(item)}
              />
            ))}
          </View>
        ))}
      </ScrollView>

      {/* Single shared bottom sheet for quantity editing -- one
          instance for the whole screen, opened by any row's pencil
          icon (see openQuantityEditor). transparent Modal + a
          Pressable backdrop is the standard RN bottom-sheet pattern;
          no extra library needed for something this simple. */}
      <Modal visible={!!editingItem} transparent animationType="slide" onRequestClose={closeQuantityEditor}>
        <Pressable style={styles.sheetBackdrop} onPress={closeQuantityEditor}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle} numberOfLines={2}>
              {editingItem ? resolveDisplayText(editingItem).split(' ').slice(1).join(' ') || editingItem.text : ''}
            </Text>
            <View style={styles.sheetStepperRow}>
              <Pressable style={styles.sheetStepperButton} onPress={() => adjustSheetQuantity(-1)} hitSlop={8}>
                <MinusIcon size={18} color={INK} />
              </Pressable>
              <TextInput
                style={styles.sheetQuantityInput}
                value={sheetQuantityDraft}
                onChangeText={setSheetQuantityDraft}
                keyboardType="numeric"
                selectTextOnFocus
                autoFocus
              />
              <Pressable style={styles.sheetStepperButton} onPress={() => adjustSheetQuantity(1)} hitSlop={8}>
                <PlusIcon size={18} color={INK} />
              </Pressable>
            </View>
            <Pressable style={styles.sheetDoneButton} onPress={commitQuantityEditor}>
              <Text style={styles.sheetDoneButtonText}>Done</Text>
            </Pressable>
            {/* Only shown once this item actually HAS an override to undo
                -- an item still at its live recipe-computed amount has
                nothing to reset back to. */}
            {editingItem && quantityOverrides.has(editingItem.key) && (
              <Pressable
                style={styles.sheetResetButton}
                onPress={() => {
                  resetQuantityOverride(editingItem.key);
                  closeQuantityEditor();
                }}
              >
                <Text style={styles.sheetResetButtonText}>Reset to original quantity</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
  // Explains where quantities come from and that they're editable, with
  // the bulk Reset button living on the same row -- text takes whatever
  // space the button doesn't need (flexShrink so it wraps instead of
  // pushing the button off-row), button itself never shrinks.
  quantityNoteRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // INK, not muted -- Anabelle's explicit call (was #767676).
  quantityNote: { flex: 1, flexShrink: 1, fontSize: 12, color: INK, lineHeight: 17 },
  // Same tertiary treatment as editButton/removeMealButton (white fill,
  // INK border) but a pill (borderRadius: 999) rather than a circle,
  // since this one has a text label, not just an icon.
  resetAllButton: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  resetAllButtonText: { fontSize: 12, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  // Same 0.35 opacity convention as stepperButtonDisabled above.
  resetAllButtonDisabled: { opacity: 0.35 },
  // paddingBottom is generous (not the usual ~40) so the last store
  // card's own right-aligned price never lands under SupportBubble -- a
  // fixed floating chat button rendered globally in _layout.tsx at
  // right:20/bottom:96 (52px tall), which otherwise sits directly on top
  // of this screen's last/bottom-most content when scrolled all the way
  // down (originally confirmed against the since-removed Total card;
  // the same risk applies to whichever card is now genuinely last).
  scrollContent: { paddingHorizontal: 20, paddingBottom: 140, gap: 20 },
  // padding: 14, matching selectedRow/storeCard below (and recipe.tsx's
  // own ingredientsModalCard/instructionsCard) -- every "modal treatment"
  // card on this screen shares the same padding now, this was the one
  // outlier at 20.
  emptyState: { backgroundColor: '#fff', borderWidth: 2, borderColor: INK, borderRadius: 16, padding: 14 },
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
  // Removing a recipe from the list reads the same as closing a modal --
  // same white-fill/INK-border circle as recipe.tsx's own closeButton.
  // Sized/bordered to match IngredientRow's own editButton exactly
  // (26x26, 1.5px border) rather than that page-level 32x32 one -- these
  // two are the pair that actually sit near each other on this screen
  // (this button up here, editButton down in each item row), so
  // Anabelle's call was to make THEM consistent with each other.
  removeMealButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  // Standard transparent-Modal bottom sheet: full-screen backdrop
  // (tap to dismiss) with the sheet itself pinned to the bottom via
  // justifyContent. The inner Pressable's onPress stopPropagation stops
  // a tap anywhere on the sheet's own content from bubbling up to the
  // backdrop and closing it.
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    gap: 16,
  },
  // Same handle-bar convention as upgrade.tsx/recipe.tsx's own modals.
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#ddd', alignSelf: 'center' },
  sheetTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK, textAlign: 'center' },
  sheetStepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  sheetStepperButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The same value the stepper buttons adjust -- editable directly too
  // (Anabelle's ask: a manual numeric-keyboard entry alongside the
  // stepper, not an either/or), so tapping it brings up the keyboard
  // for typing an exact amount instead of tapping +/- repeatedly.
  sheetQuantityInput: {
    minWidth: 70,
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 12,
    paddingVertical: 10,
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'OpenSans_700Bold',
    color: INK,
    textAlign: 'center',
  },
  sheetDoneButton: {
    height: 52,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetDoneButtonText: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  // Plain text link, not a bordered button -- this is a secondary/
  // undo-style action sitting right below the sheet's one real primary
  // action (Done), so it deliberately doesn't compete visually with it.
  sheetResetButton: { alignItems: 'center', paddingVertical: 4 },
  sheetResetButtonText: {
    fontSize: 13,
    color: '#767676',
    textDecorationLine: 'underline',
  },
});
