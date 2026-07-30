export interface DealTag {
  name: string;
  discountPct: number;
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
export interface IngredientLine {
  text: string;
  dealTag?: DealTag;
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
}
