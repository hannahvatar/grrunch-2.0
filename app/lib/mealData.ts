export interface DealTag {
  name: string;
  discountPct: number;
  price?: number;
  originalPrice?: number;
  store?: string;
  imageUrl?: string;
  // True when the deal's package size was our best assumption (Airtable
  // "Estimated quantity") rather than stated on the flyer itself -- lets
  // the grocery list flag that the quantity shown is a guess, not a fact.
  quantityEstimated?: boolean;
}

// An ingredient line, with the matching deal tag attached when that
// ingredient was sourced from a real flyer deal -- lets the grocery list
// show the deal's image/store next to the item it actually came from.
// estimatedPrice is set instead, client-side, when the ingredient isn't
// on any deal but matches a generic staple (see lib/staplePrices.ts) --
// never both at once, and never invented when neither applies.
export interface IngredientLine {
  text: string;
  // The raw ingredient name (no quantity/unit) -- kept alongside the
  // flattened display text so the grocery list can match it against this
  // week's deals for store attribution even when it isn't deal-tagged
  // (see lib/curatedDeals.ts matchItemStore).
  name: string;
  dealTag?: DealTag;
  estimatedPrice?: { avgPrice: number; unit: string; source: 'statcan' | 'produce' | 'staple' };
  // Grocery-list-only override of `text`, for staples the recipe states
  // in cooked terms (e.g. "2 cups Rice") but that you actually buy dry
  // (e.g. "⅔ cup (123 g) dry Rice") -- see lib/unitConversion.ts
  // describeDryEquivalent. The recipe page keeps showing `text` (the
  // cooked amount the dish/instructions actually use) unchanged.
  groceryText?: string;
}

// Meal shape shared by the recipes data layer (lib/recipes.ts) and the
// screens that render it (Meals tab, recipe.tsx, Profile's saved recipes).
export interface Meal {
  id: string;
  name: string;
  price: number;
  minutes: number;
  servings: number;
  dealTags: DealTag[];
  calories: number;
  protein: number;
  ingredients: IngredientLine[];
  instructions: string[];
  // Whole-recipe (not per-serving) totals split by whether an ingredient
  // is a deal-tagged anchor (fixed*, bought as a whole package, never
  // fragmented -- see docs/grrunch-architecture.md item 12) or a generic
  // staple (flexible*). Computed server-side (refresh_recipe_nutrition/
  // refresh_recipe_deal_tags) but not currently used client-side -- see
  // the archive/dynamic-meal-scaling branch for the earlier feature that
  // consumed this to resize a recipe toward a calorie/protein target.
  // Left populated (not removed) in case that's revisited later; every
  // recipe's displayed calories/protein/price is just its own real,
  // un-scaled serving now (lib/mealScaling.ts).
  fixedCalories?: number;
  flexibleCalories?: number;
  fixedProtein?: number;
  flexibleProtein?: number;
  fixedPrice?: number;
  flexiblePrice?: number;
}
