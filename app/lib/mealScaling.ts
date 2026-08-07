import type { Meal } from './mealData';
import type { PlanTargets } from './planTargets';

// A recipe's ingredients -- including its deal-tagged anchor package (see
// docs/grrunch-architecture.md item 12) -- are fixed for the whole batch;
// nothing about that changes here. What the Plan tab's calorie/protein
// targets actually pick is how many equal servings that same batch is
// divided into: fewer, bigger servings raise calories/protein per serving
// (and lower how many servings the batch yields); more, smaller servings
// do the opposite. The batch's total calories/protein/price stay fixed
// either way, so this never fragments or strands any of it -- it's purely
// how thick a slice of the already-fully-used batch each serving is.
//
// Searches a bounded range around the recipe's own natural yield (half to
// 4x) so a portion choice can't balloon into an unrealistic sliver or a
// comically oversized single sitting. Among splits that fit under the
// calorie ceiling and clear the protein floor, prefers whichever balances
// the two best -- not just the first (fewest-servings) match, and not just
// whichever is closest on protein alone (which can leave calories way
// under target to squeeze protein down to nearly its floor). Each target's
// gap is measured relative to its own target size (so a 100-calorie gap
// and a 5g-protein gap are comparable), and the split chosen is whichever
// minimizes the WORSE of the two gaps -- not their sum. Summing would let
// one gap shrink toward zero at the other's expense as servings change in
// one direction (since the two move in lockstep, one always improves while
// the other worsens); minimizing the worse of the two instead keeps
// neither one from being sacrificed for the other, landing on whichever
// split leaves both calories and protein proportionally about as close to
// their targets as this recipe's macros allow. When only one of the two
// targets is set, its gap is the only term, so this reduces to "closest on
// that one target alone" -- unchanged from before for single-target cases.
export function scaleMealToTargets(meal: Meal, targets: PlanTargets): Meal | null {
  const { maxCalories, minProtein } = targets;
  if (maxCalories === undefined && minProtein === undefined) return meal;

  const totalCalories = meal.calories * meal.servings;
  const totalProtein = meal.protein * meal.servings;
  const totalPrice = meal.price * meal.servings;

  const minServings = Math.max(1, Math.ceil(meal.servings / 2));
  const maxServings = meal.servings * 4;

  let best: number | null = null;
  let bestGap = Infinity;
  for (let s = minServings; s <= maxServings; s++) {
    const caloriesPerServing = totalCalories / s;
    const proteinPerServing = totalProtein / s;
    if (maxCalories !== undefined && caloriesPerServing > maxCalories) continue;
    if (minProtein !== undefined && proteinPerServing < minProtein) continue;

    const calorieGap = maxCalories !== undefined ? (maxCalories - caloriesPerServing) / maxCalories : 0;
    const proteinGap = minProtein !== undefined ? (proteinPerServing - minProtein) / minProtein : 0;
    const gap = Math.max(calorieGap, proteinGap);
    if (gap < bestGap) {
      bestGap = gap;
      best = s;
    }
  }

  if (best === null) return null;

  return {
    ...meal,
    servings: best,
    calories: Math.round(totalCalories / best),
    protein: Math.round((totalProtein / best) * 10) / 10,
    price: Math.round((totalPrice / best) * 100) / 100,
  };
}
