import { createContext, type ReactNode, useContext, useState } from 'react';

import type { IngredientLine, Meal } from './mealData';
import { portionCost } from './unitConversion';

// The store chips at the top of Weekly Deals, Meals and My list
// (Anabelle, 2026-10-05): ONE selection shared by all three pages, so
// turning a store off anywhere turns it off everywhere. Every chain
// starts selected; it isn't persisted (resets on next launch) and is
// separate from the saved stores in lib/selectedStores.tsx.
//
// What unselecting a chain does:
//   - Weekly Deals hides that chain's deals.
//   - Meals, recipe pages and My list: any ingredient priced on that
//     chain's deal moves to "Not on sale at your stores", priced at the
//     deal's own regular price (its originalPrice, the "$X avg." already
//     shown on the deal), and price per serving goes up by the difference.
//     Single deals added to My list straight from Weekly Deals stay as-is.
export const STORE_CHAINS = ['No Frills', 'Real Canadian Superstore', 'Safeway', 'Save-On-Foods', 'Walmart'];

interface StoreFilterContextValue {
  hiddenChains: Set<string>;
  isHidden: (chain: string) => boolean;
  toggleChain: (chain: string) => void;
  showAllChains: () => void;
}

const StoreFilterContext = createContext<StoreFilterContextValue | undefined>(undefined);

export function StoreFilterProvider({ children }: { children: ReactNode }) {
  const [hiddenChains, setHiddenChains] = useState<Set<string>>(new Set());

  function toggleChain(chain: string) {
    setHiddenChains((prev) => {
      const next = new Set(prev);
      if (next.has(chain)) next.delete(chain);
      else next.add(chain);
      return next;
    });
  }

  return (
    <StoreFilterContext.Provider
      value={{
        hiddenChains,
        isHidden: (chain) => hiddenChains.has(chain),
        toggleChain,
        showAllChains: () => setHiddenChains(new Set()),
      }}
    >
      {children}
    </StoreFilterContext.Provider>
  );
}

export function useStoreFilter(): StoreFilterContextValue {
  const ctx = useContext(StoreFilterContext);
  if (!ctx) throw new Error('useStoreFilter must be used within a StoreFilterProvider');
  return ctx;
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
