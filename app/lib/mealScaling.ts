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
// Critically, servings is NOT a free lever here -- see
// recipes.servings' own column comment: "based on the actual package/bulk
// size of its anchor ingredient(s) -- not an arbitrary user-chosen
// quantity." You can't buy 4/5 of a chicken-breast pack, so the only way
// to get MORE food than one batch yields is to buy another whole batch's
// worth of every fixed ingredient -- servings only ever comes in whole
// multiples of the recipe's own natural yield (naturalServings, 2x, 3x,
// ...), never an arbitrary in-between count (see resizeMealServings/
// servingsOptions below, used by the recipe page's manual stepper).
// Making N whole batches instead of 1 scales the fixed AND flexible
// totals by the same N, which cancels out of the per-serving math
// entirely -- per-serving calories/protein/price are the same whether
// you make 1 batch or 4, so batch count is purely a "how much to prep"
// choice, never a target-fitting lever. The staple multiplier (k) is the
// one genuine lever for hitting a calorie/protein target -- staples are
// bought by weight/bulk, not as a discrete package, so their quantity
// can flex continuously.
//
// Bounded the same spirit as before: staple multiplier within half to 3x
// the recipe's original staple quantity -- wide enough to matter, narrow
// enough that a recommendation never balloons into "10x the rice."
//
// maxCalories is a ceiling (use the budget, don't blow it) but
// minProtein is a floor (clear it -- exceeding it isn't a defect worth
// avoiding). Both are still hard constraints -- only k values that fit
// under the ceiling and clear the floor are ever considered -- but among
// those, the objective is to get calories as close to the ceiling as the
// staple multiplier allows, full stop (protein overshoot isn't a cost:
// once the floor's cleared, more protein is a bonus, not a defect worth
// trading calorie-budget usage away for). Falls back to "stay close to
// the floor" only when there's no calorie ceiling to approach at all.
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
  // locked at 1) for rows synced before this split existed, or recipes
  // with no matched staples at all -- those recipes have no lever to
  // work with, so they either already fit the targets or don't.
  const fixedCalories = meal.fixedCalories ?? totalCalories;
  const flexibleCalories = meal.flexibleCalories ?? 0;
  const fixedProtein = meal.fixedProtein ?? totalProtein;
  const flexibleProtein = meal.flexibleProtein ?? 0;
  const fixedPrice = meal.fixedPrice ?? totalPrice;
  const flexiblePrice = meal.flexiblePrice ?? 0;
  const hasFlexibleIngredients = flexibleCalories > 0 || flexibleProtein > 0;
  const servings = meal.servings;

  const multiplierRange = hasFlexibleIngredients
    ? rangeInclusive(MIN_STAPLE_MULTIPLIER, MAX_STAPLE_MULTIPLIER, STAPLE_MULTIPLIER_STEP)
    : [1];

  let bestMultiplier: number | null = null;
  let bestScore = Infinity;

  for (const k of multiplierRange) {
    const caloriesPerServing = (fixedCalories + k * flexibleCalories) / servings;
    const proteinPerServing = (fixedProtein + k * flexibleProtein) / servings;
    if (maxCalories !== undefined && caloriesPerServing > maxCalories) continue;
    if (minProtein !== undefined && proteinPerServing < minProtein) continue;

    const primaryGap =
      maxCalories !== undefined
        ? (maxCalories - caloriesPerServing) / maxCalories
        : minProtein !== undefined
          ? (proteinPerServing - minProtein) / minProtein
          : 0;
    // Tiny tiebreak weight (0.001) so it only ever decides between
    // combinations that are otherwise equally good -- never enough to
    // override a genuinely better fit on the primary objective.
    const score = primaryGap + 0.001 * Math.abs(k - 1);
    if (score < bestScore) {
      bestScore = score;
      bestMultiplier = k;
    }
  }

  if (bestMultiplier === null) return null;

  const finalCalories = fixedCalories + bestMultiplier * flexibleCalories;
  const finalProtein = fixedProtein + bestMultiplier * flexibleProtein;
  const finalPrice = fixedPrice + bestMultiplier * flexiblePrice;

  return {
    ...meal,
    servings,
    calories: Math.round(finalCalories / servings),
    protein: Math.round((finalProtein / servings) * 10) / 10,
    price: Math.round((finalPrice / servings) * 100) / 100,
    stapleMultiplier: Math.abs(bestMultiplier - 1) > 0.001 ? Math.round(bestMultiplier * 100) / 100 : undefined,
  };
}

// Lets the recipe page's manual servings stepper choose how many whole
// batches to make (see the module docstring for why this only ever comes
// in multiples of the recipe's natural yield). Per-serving
// calories/protein/price don't change with batch count -- making 2
// batches instead of 1 doubles the total food, not what's in each
// serving -- so this only ever updates the displayed serving count,
// never the macros scaleMealToTargets already computed.
export function resizeMealServings(meal: Meal, servings: number): Meal {
  return servings === meal.servings ? meal : { ...meal, servings };
}

// The only servings counts resizeMealServings should ever be called
// with: whole multiples of the recipe's own natural yield, 1x up to 4x
// (matching the staple multiplier's upper bound's spirit -- wide enough
// to matter, narrow enough that a recipe never suggests preparing an
// unrealistic 10 batches at once).
export function servingsOptions(naturalServings: number): number[] {
  return [1, 2, 3, 4].map((n) => naturalServings * n);
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
