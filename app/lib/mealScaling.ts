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
//
// maxCalories is a ceiling (use the budget, don't blow it) but
// minProtein is a floor (clear it -- exceeding it isn't a defect worth
// avoiding). Both are still hard constraints -- only combinations that
// fit under the ceiling and clear the floor are ever considered -- but
// among those, the objective is to get calories as close to the ceiling
// as the staple multiplier allows, full stop. (Servings-only scaling,
// pre-2b, had to balance the two gaps against each other -- see the old
// minimax reasoning in git history -- because calories and protein were
// locked together 1:1 by serving count alone; every route to more
// calories was also a route to more protein, so pushing hard toward the
// calorie ceiling could badly overshoot the protein floor for no
// benefit. With a staple multiplier as a second, largely-independent
// lever, that coupling is gone -- more rice raises calories toward the
// ceiling with only a small protein side-effect, so there's no longer a
// real tension to balance, and treating "protein above the floor" as a
// cost to minimize was actively wrong: it stopped the search from using
// the calorie budget it had plenty of room to use (confirmed: a 600
// cal/30g protein target was landing at 471 cal when 571 was reachable
// within the multiplier bound). When only minProtein is set (no
// calorie ceiling to approach), falls back to the old "stay close to
// the floor" objective -- unaffected by this change, since there's
// nothing to approach on the calorie side in that case. A small
// tiebreak still prefers the least distortion from the recipe's
// original staple quantity when multiple combinations tie exactly.
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

      // Primary objective: get as close to the calorie ceiling as
      // possible (it's a budget to use, not just a limit to respect).
      // Only falls back to "stay close to the protein floor" when
      // there's no calorie ceiling to approach at all -- see comment
      // above for why protein overshoot isn't a cost once a ceiling
      // exists to optimize toward instead.
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

// Lets the recipe page's manual servings stepper resize a meal (typically
// one already fit to the Plan tab's targets by scaleMealToTargets above)
// to an exact serving count the person chooses, overriding the automatic
// choice. Keeps the same total batch -- fixed ingredients, and the
// flexible/staple portion at whatever multiplier scaleMealToTargets
// already picked -- and just re-slices it into a different number of
// servings, same "total stays fixed, only how thick each slice is
// changes" principle as scaleMealToTargets itself. Deliberately doesn't
// re-run the target search: this is a direct override, not a new fit.
export function resizeMealServings(meal: Meal, servings: number): Meal {
  if (servings === meal.servings) return meal;
  const totalCalories = meal.calories * meal.servings;
  const totalProtein = meal.protein * meal.servings;
  const totalPrice = meal.price * meal.servings;
  return {
    ...meal,
    servings,
    calories: Math.round(totalCalories / servings),
    protein: Math.round((totalProtein / servings) * 10) / 10,
    price: Math.round((totalPrice / servings) * 100) / 100,
  };
}

// Same bounds scaleMealToTargets searches within -- half to 4x a recipe's
// own natural yield -- reused here so the manual stepper never offers a
// serving count the automatic search wouldn't itself have considered.
export function servingsBounds(naturalServings: number): { min: number; max: number } {
  return { min: Math.max(1, Math.ceil(naturalServings / 2)), max: naturalServings * 4 };
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
