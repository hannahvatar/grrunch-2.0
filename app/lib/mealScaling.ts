import type { Meal } from './mealData';

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

export type MealSortMode = 'price' | 'alphabetical';

// Lets the recipe page's manual servings stepper choose how many whole
// batches of a recipe's own natural serving count to make -- e.g. 2x a
// 4-serving recipe to prep 8. Per-serving calories/protein/price don't
// change with batch count (making 2 batches doubles the total food, not
// what's in each serving), so this only ever updates the displayed
// serving count.
export function resizeMealServings(meal: Meal, servings: number): Meal {
  return servings === meal.servings ? meal : { ...meal, servings };
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
