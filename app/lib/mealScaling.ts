import type { Meal } from './mealData';
import type { PlanTargets } from './planTargets';

// The Plan tab's calorie/protein sliders are a SORT preference, not a
// filter or a scaling target -- see git history / the archive/dynamic-
// meal-scaling branch for the earlier approach (resizing a recipe's
// anchor ingredient and staple quantities to force-fit an exact target).
// That worked, but its cost was real: every recipe needed a viable
// protein-dense anchor and enough flexible bulk to hit whatever number
// was chosen, or it silently disappeared from the list -- several
// perfectly good recipes (built around a smaller or leaner deal item)
// never showed for anything but a narrow band of targets, no matter how
// much the scaling math was corrected. Coverage and cost-per-serving
// matter more here than hitting an exact macro number -- every recipe
// with an active deal should be visible, showing its own real, standard
// serving (already computed by refresh_recipe_nutrition/
// refresh_recipe_deal_tags -- see meal.calories/protein/price/servings),
// never resized. The sliders just reorder that same list so whichever
// recipes happen to be closest to what someone wants surface first.
export function sortMealsByTargetFit(meals: Meal[], targets: PlanTargets): Meal[] {
  const { maxCalories, minProtein } = targets;
  if (maxCalories === undefined && minProtein === undefined) return meals;

  // Distance from the target, normalized against the target itself so a
  // 50-calorie gap and a 5g-protein gap are comparable -- same reasoning
  // as the old scaling code's gap metric, just measuring "how far is
  // this recipe's real serving from what they asked for" instead of
  // "how far is the best achievable resize." Calories reads as
  // over-or-under (a recipe well under the calorie preference isn't a
  // worse match than one well over it -- both just aren't a close hit);
  // protein does too, since this is a preference to aim for, not a
  // floor to clear.
  function distance(meal: Meal): number {
    const calorieDistance =
      maxCalories !== undefined ? Math.abs(meal.calories - maxCalories) / maxCalories : 0;
    const proteinDistance =
      minProtein !== undefined ? Math.abs(meal.protein - minProtein) / minProtein : 0;
    return calorieDistance + proteinDistance;
  }

  return [...meals].sort((a, b) => distance(a) - distance(b));
}

// The Meals tab's other sort option -- cheapest real cost-per-serving
// first, no target involved. Same "never resize, just reorder"
// principle as sortMealsByTargetFit.
export function sortMealsByPrice(meals: Meal[]): Meal[] {
  return [...meals].sort((a, b) => a.price - b.price);
}

export type MealSortMode = 'targetFit' | 'price';

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
