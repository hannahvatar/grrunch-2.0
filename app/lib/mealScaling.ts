import { isReferencePriced } from './curatedDeals';
import type { IngredientLine, Meal } from './mealData';
import { describeQuantityText } from './unitConversion';

// There's no per-user calorie/protein target anymore (see git history /
// the archive/calorie-protein-plan-targets and archive/dynamic-meal-
// scaling branches for the two earlier approaches this replaced -- first
// resizing a recipe to force-fit an exact target, then sorting the list
// by closeness to a user-chosen target). Both cost real coverage or
// complexity for a benefit that turned out not to matter as much as
// three simpler things: every recipe with an active deal is visible,
// every recipe's own serving is designed to already land in a normal
// range (~500 cal / ~20g protein, +/-30%) rather than needing a filter
// to find one that does, and real cost-per-serving is front and center
// -- every recipe stays under $4/serving (2026-08-08 audit: $1.03-
// $3.78 across all 9). Price note for whoever edits a recipe next: a
// deal-tagged anchor is charged its full package price exactly once no
// matter what gram quantity the recipe's ingredient line states -- you
// buy the whole discounted package regardless of how much of it ends
// up in this dish. So neither the ingredient quantities nor the
// calorie/protein target move price at all; the only real lever is
// servings count (the same fixed anchor cost divided across more
// portions). These two functions just reorder that same always-shown
// list -- never resized, never excluded.
export function sortMealsByPrice(meals: Meal[]): Meal[] {
  return [...meals].sort((a, b) => a.price - b.price);
}

export function sortMealsByName(meals: Meal[]): Meal[] {
  return [...meals].sort((a, b) => a.name.localeCompare(b.name));
}

// A recipe's own average REAL savings % across its deal-tagged
// ingredients -- "real" meaning a genuine store markdown, not a
// reference-sourced comparison price (see isReferencePriced();
// GroceryListView.tsx's avgSavingsPct uses the same exclusion for the
// same reason: a reference tag's discountPct is a comparison WE made,
// never a claim the store printed, so it shouldn't count toward "how
// good a deal is this recipe"). A recipe with no real deal tags at all
// sorts to the bottom (0%), same as it already reads on the card itself
// (no discount badge shown).
function avgRealSavingsPct(meal: Meal): number {
  const real = meal.dealTags.filter((tag) => !isReferencePriced(tag.originalPriceSource));
  if (real.length === 0) return 0;
  return real.reduce((sum, tag) => sum + tag.discountPct, 0) / real.length;
}

export function sortMealsByBestDeal(meals: Meal[]): Meal[] {
  return [...meals].sort((a, b) => avgRealSavingsPct(b) - avgRealSavingsPct(a));
}

export type MealSortMode = 'cheapest' | 'bestDeal';

// Rebuilds a single ingredient's display text for a whole-batch
// multiplier -- shared by the recipe page's servings stepper
// (resizeMealServings below) and the Grocery list's per-recipe "make
// this Nx" control, so "2x the recipe" reads identically wherever it
// shows up.
//
// A deal-tagged ingredient is left completely untouched: we never
// fragment a deal item, so 2x a recipe never means "2x the recipe's
// stated gram amount" for it -- it means buying 2 whole packages,
// which the UI communicates with a x2 badge next to the unscaled "1
// package ..." text (see IngredientRow's multiplier prop), not by
// rewriting the ingredient line itself.
//
// A staple (no deal tag) genuinely uses more of itself per batch, so
// its own stated quantity is scaled directly into the text instead --
// "4.5 cups Rice" at 2x becomes "9 cups Rice", not "4.5 cups Rice x2".
// Passes the ingredient's own NATURAL quantity through to
// describeQuantityText along with the multiplier, rather than
// pre-scaling it here -- describeQuantityText needs the natural amount
// to snap a whole-unit-count staple (e.g. Onions) BEFORE scaling, not
// after (see describeUnitCount).
export function scaleIngredientDisplay(
  ingredient: IngredientLine,
  multiplier: number
): { text: string; groceryText?: string } {
  if (ingredient.dealTag || multiplier === 1) {
    return { text: ingredient.text, groceryText: ingredient.groceryText };
  }
  return describeQuantityText(ingredient.name, ingredient.quantity, ingredient.unit, multiplier);
}

// Lets the recipe page's manual servings stepper choose how many whole
// batches of a recipe's own natural serving count to make -- e.g. 2x a
// 4-serving recipe to prep 8. Per-serving calories/protein/price don't
// change with batch count (making 2 batches doubles the total food, not
// what's in each serving) -- only the displayed serving count and each
// staple ingredient's displayed quantity (see scaleIngredientDisplay).
export function resizeMealServings(meal: Meal, servings: number): Meal {
  if (servings === meal.servings) return meal;
  const multiplier = servings / meal.servings;
  const ingredients = meal.ingredients.map((ingredient) => ({
    ...ingredient,
    ...scaleIngredientDisplay(ingredient, multiplier),
  }));
  return { ...meal, servings, ingredients };
}

// The servings counts resizeMealServings should be called with: whole
// multiples of the recipe's own natural yield, 1x up to 4x -- wide
// enough to matter, narrow enough that a recipe never suggests
// preparing an unrealistic 10 batches at once. You can't buy a fraction
// of a deal-tagged package, so this never offers an arbitrary in-between
// count (e.g. "5 servings" from a 4-serving recipe).
export function servingsOptions(naturalServings: number): number[] {
  return [1, 2, 3, 4].map((n) => naturalServings * n);
}
