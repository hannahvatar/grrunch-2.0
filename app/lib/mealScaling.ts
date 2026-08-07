import type { Meal } from './mealData';
import type { PlanTargets } from './planTargets';

// A recipe's deal-tagged anchor ingredients (see docs/grrunch-architecture.md
// item 12) are fixed for the whole batch -- bought as a whole package,
// never fragmented, nothing about that changes here. Its generic staples
// (rice, potatoes, oil...), on the other hand, CAN be bought in more or
// less quantity -- see meal.flexibleCalories/flexibleProtein/flexiblePrice
// (the portion of the whole-recipe totals that come from staples, split
// out by refresh_recipe_nutrition/refresh_recipe_deal_tags) vs meal.fixed*
// (deal-tagged, never changes).
//
// The Plan tab's calorie/protein targets get two independent levers to
// work with: how many equal servings the batch is divided into (as
// before), and a staple multiplier scaling the flexible portion up or
// down (e.g. more rice bulks up calories with little protein cost; less
// rice concentrates protein-per-calorie). Searches both jointly rather
// than serving count alone -- a recipe with a lot of flexible calories
// (e.g. a pasta dish) can genuinely hit a much tighter target this way
// than serving count alone allows.
//
// Bounded the same spirit as before: servings within half to 4x the
// recipe's own natural yield, staple multiplier within half to 3x the
// recipe's original staple quantity -- wide enough to matter, narrow
// enough that a recommendation never balloons into "10x the rice."
// Among combinations that fit under the calorie ceiling and clear the
// protein floor, picks whichever balances the two best (minimax gap,
// each measured relative to its own target -- see the servings-only
// version's reasoning, unchanged), with a small tiebreak preferring the
// least distortion from the recipe's original staple quantity when
// multiple combinations balance equally well.
const MIN_STAPLE_MULTIPLIER = 0.5;
const MAX_STAPLE_MULTIPLIER = 3;
const STAPLE_MULTIPLIER_STEP = 0.1;

export function scaleMealToTargets(meal: Meal, targets: PlanTargets): Meal | null {
  const { maxCalories, minProtein } = targets;
  if (maxCalories === undefined && minProtein === undefined) return meal;

  const totalCalories = meal.calories * meal.servings;
  const totalProtein = meal.protein * meal.servings;
  const totalPrice = meal.price * meal.servings;

  // Split into fixed/flexible when the data's available (see mealData.ts);
  // falls back to treating the whole total as fixed (staple multiplier
  // locked at 1, same as the old servings-only behavior) for rows synced
  // before this split existed, or recipes with no matched staples at all.
  const fixedCalories = meal.fixedCalories ?? totalCalories;
  const flexibleCalories = meal.flexibleCalories ?? 0;
  const fixedProtein = meal.fixedProtein ?? totalProtein;
  const flexibleProtein = meal.flexibleProtein ?? 0;
  const fixedPrice = meal.fixedPrice ?? totalPrice;
  const flexiblePrice = meal.flexiblePrice ?? 0;
  const hasFlexibleIngredients = flexibleCalories > 0 || flexibleProtein > 0;

  const minServings = Math.max(1, Math.ceil(meal.servings / 2));
  const maxServings = meal.servings * 4;

  let bestServings: number | null = null;
  let bestMultiplier = 1;
  let bestScore = Infinity;

  for (let s = minServings; s <= maxServings; s++) {
    // Without flexible ingredients to work with, multiplier is locked at
    // 1 -- searching a range that can't change anything would just waste
    // cycles and risk a spurious tiebreak drift away from 1.
    const multiplierRange = hasFlexibleIngredients
      ? rangeInclusive(MIN_STAPLE_MULTIPLIER, MAX_STAPLE_MULTIPLIER, STAPLE_MULTIPLIER_STEP)
      : [1];

    for (const k of multiplierRange) {
      const caloriesPerServing = (fixedCalories + k * flexibleCalories) / s;
      const proteinPerServing = (fixedProtein + k * flexibleProtein) / s;
      if (maxCalories !== undefined && caloriesPerServing > maxCalories) continue;
      if (minProtein !== undefined && proteinPerServing < minProtein) continue;

      const calorieGap = maxCalories !== undefined ? (maxCalories - caloriesPerServing) / maxCalories : 0;
      const proteinGap = minProtein !== undefined ? (proteinPerServing - minProtein) / minProtein : 0;
      // Tiny tiebreak weight (0.001) so it only ever decides between
      // combinations that are otherwise equally good -- never enough to
      // override a genuinely better calorie/protein fit.
      const score = Math.max(calorieGap, proteinGap) + 0.001 * Math.abs(k - 1);
      if (score < bestScore) {
        bestScore = score;
        bestServings = s;
        bestMultiplier = k;
      }
    }
  }

  if (bestServings === null) return null;

  const finalCalories = fixedCalories + bestMultiplier * flexibleCalories;
  const finalProtein = fixedProtein + bestMultiplier * flexibleProtein;
  const finalPrice = fixedPrice + bestMultiplier * flexiblePrice;

  return {
    ...meal,
    servings: bestServings,
    calories: Math.round(finalCalories / bestServings),
    protein: Math.round((finalProtein / bestServings) * 10) / 10,
    price: Math.round((finalPrice / bestServings) * 100) / 100,
    stapleMultiplier: Math.abs(bestMultiplier - 1) > 0.001 ? Math.round(bestMultiplier * 100) / 100 : undefined,
  };
}

function rangeInclusive(min: number, max: number, step: number): number[] {
  const values: number[] = [];
  // Rounding guards against float drift (e.g. 0.7 + 0.1 landing on
  // 0.7999999999999999) producing a duplicate or off-by-one-step value.
  for (let v = min; v <= max + step / 2; v += step) {
    values.push(Math.round(v * 100) / 100);
  }
  return values;
}
