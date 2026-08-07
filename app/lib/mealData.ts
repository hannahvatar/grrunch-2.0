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
  // True for generic staples (no dealTag) -- the portion of a recipe
  // scaleMealToTargets can scale up/down (meal.stapleMultiplier) to help
  // hit a calorie/protein target, unlike a deal-tagged anchor item bought
  // as a whole package. See mealScaling.ts.
  isFlexible: boolean;
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
  // Whole-recipe (not per-serving) totals split by whether that portion
  // can flex: fixed* comes from deal-tagged anchor ingredients (bought as
  // a whole package, never fragmented -- see docs/grrunch-architecture.md
  // item 12); flexible* comes from generic staples at this recipe's
  // original quantities, which scaleMealToTargets CAN scale up/down to
  // help hit a calorie/protein target. fixed + flexible = calories/
  // protein/price * servings, at baseline (stapleMultiplier = 1).
  // Undefined on rows synced before this split existed.
  fixedCalories?: number;
  flexibleCalories?: number;
  fixedProtein?: number;
  flexibleProtein?: number;
  fixedPrice?: number;
  flexiblePrice?: number;
  // Set by scaleMealToTargets when hitting the plan's targets required
  // more than a serving-count change -- how much this recipe's flexible
  // (staple) ingredients were scaled by, e.g. 1.4 = 40% more rice/potatoes/
  // etc. than the recipe's original quantities. Undefined (equivalent to
  // 1, no change) on the raw, un-scaled meal.
  stapleMultiplier?: number;
  // This recipe's protein-anchor deal item (see lib/dealNutrition.ts
  // findAnchor), if one was identified -- e.g. the chicken breast pack in
  // a roasted-chicken recipe, not the broccoli also on the flyer that
  // week. scaleMealToTargets sizes this ingredient's per-serving portion
  // to the Plan tab's protein target directly (see mealScaling.ts) rather
  // than splitting the whole package evenly across the recipe's originally
  // authored serving count. Undefined when no ingredient in the recipe is
  // both protein-dense enough and has a known package size to anchor on --
  // those recipes fall back to the older whole-batch model.
  anchor?: { caloriesPer100g: number; proteinPer100g: number; packageGrams: number };
}
