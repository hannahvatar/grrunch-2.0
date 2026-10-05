import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';

import type { IngredientLine, Meal } from './mealData';
import { portionCost } from './unitConversion';

// The store chips at the top of Weekly Deals and Meals (Anabelle,
// 2026-10-05). Each page has its OWN selection ('deals' / 'meals'),
// every chain starts selected, and neither is persisted (resets on next
// launch) or tied to the saved stores in lib/selectedStores.tsx. Each
// page also has its own one-time notice (StoreFilterNoticeModal).
//
// What unselecting a chain does:
//   - 'deals' (Weekly Deals): hides that chain's deals.
//   - 'meals' (Meals + recipe pages): any ingredient priced on that
//     chain's deal moves to "Not on sale at your stores", priced at the
//     deal's own regular price (its originalPrice, the "$X avg." already
//     shown on the deal), and price per serving goes up by the difference.
export const STORE_CHAINS = ['No Frills', 'Real Canadian Superstore', 'Safeway', 'Save-On-Foods', 'Walmart'];

export type StoreFilterScope = 'deals' | 'meals';

// 'deals' keeps the original key so a device that already saw the
// Weekly Deals notice doesn't see it again.
const NOTICE_SEEN_KEYS: Record<StoreFilterScope, string> = {
  deals: 'grrunch:storeFilterNoticeSeen',
  meals: 'grrunch:storeFilterNoticeSeen:meals',
};

interface ScopeState {
  hiddenChains: Set<string>;
  isHidden: (chain: string) => boolean;
  toggleChain: (chain: string) => void;
  // The first unselect on a device asks for confirmation (StoreChips'
  // notice modal); after "Got it" it never asks again for that page.
  noticeSeen: boolean;
  markNoticeSeen: () => void;
}

const StoreFilterContext = createContext<Record<StoreFilterScope, ScopeState> | undefined>(undefined);

function useScopeState(scope: StoreFilterScope): ScopeState {
  const [hiddenChains, setHiddenChains] = useState<Set<string>>(new Set());
  const [noticeSeen, setNoticeSeen] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(NOTICE_SEEN_KEYS[scope])
      .then((value) => setNoticeSeen(value === 'true'))
      .catch(() => {});
  }, [scope]);

  return {
    hiddenChains,
    isHidden: (chain) => hiddenChains.has(chain),
    toggleChain: (chain) =>
      setHiddenChains((prev) => {
        const next = new Set(prev);
        if (next.has(chain)) next.delete(chain);
        else next.add(chain);
        return next;
      }),
    noticeSeen,
    markNoticeSeen: () => {
      setNoticeSeen(true);
      AsyncStorage.setItem(NOTICE_SEEN_KEYS[scope], 'true').catch(() => {});
    },
  };
}

export function StoreFilterProvider({ children }: { children: ReactNode }) {
  const deals = useScopeState('deals');
  const meals = useScopeState('meals');
  return <StoreFilterContext.Provider value={{ deals, meals }}>{children}</StoreFilterContext.Provider>;
}

export function useStoreFilter(scope: StoreFilterScope): ScopeState {
  const ctx = useContext(StoreFilterContext);
  if (!ctx) throw new Error('useStoreFilter must be used within a StoreFilterProvider');
  return ctx[scope];
}

// " · about $0.62" -- the deal's own portion cost, appended to the
// "Recipe uses ..." note by lib/recipes.ts. Dropped for an off-sale
// line, whose regular-price cost shows as its "$X avg." instead.
const PORTION_COST_SUFFIX = / · about \$[\d.]+$/;

// Re-prices a recipe for the unselected chains. Each deal-tagged
// ingredient whose deal comes from a hidden chain becomes an off-sale
// line (no dealTag, offSale: true, estimatedPrice = its regular cost);
// the chain's deal tags drop off the card; and price per serving moves
// by (regular cost - deal cost) / servings. Costs use portionCost for
// a partial package (same rule as the deal's own "about $X"), else the
// whole package -- the same split refresh_recipe_deal_tags() uses.
export function applyStoreFilter(meal: Meal, hiddenChains: Set<string>): Meal {
  if (hiddenChains.size === 0) return meal;
  let totalDelta = 0;
  let changed = false;
  const ingredients: IngredientLine[] = meal.ingredients.map((ingredient) => {
    const tag = ingredient.dealTag;
    if (!tag?.store || !hiddenChains.has(tag.store)) return ingredient;
    changed = true;
    const dealCost =
      portionCost(ingredient.quantity, ingredient.unit, ingredient.name, tag) ?? tag.price ?? 0;
    const regularCost =
      portionCost(ingredient.quantity, ingredient.unit, ingredient.name, { ...tag, price: tag.originalPrice }) ??
      tag.originalPrice ??
      dealCost;
    totalDelta += regularCost - dealCost;
    return {
      ...ingredient,
      dealTag: undefined,
      offSale: true,
      dealDisplayText: undefined,
      estimatedPrice: { avgPrice: regularCost, unit: '', source: 'regular' },
      useQuantityText: ingredient.useQuantityText?.replace(PORTION_COST_SUFFIX, ''),
    };
  });
  if (!changed) return meal;
  return {
    ...meal,
    ingredients,
    dealTags: meal.dealTags.filter((tag) => !tag.store || !hiddenChains.has(tag.store)),
    price: meal.price + totalDelta / meal.servings,
  };
}
