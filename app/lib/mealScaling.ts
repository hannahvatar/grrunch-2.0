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
// comically oversized single sitting. Among valid splits, prefers the
// fewest servings -- the most generous portion that still fits under the
// calorie ceiling and clears the protein floor.
export function scaleMealToTargets(meal: Meal, targets: PlanTargets): Meal | null {
  const { maxCalories, minProtein } = targets;
  if (maxCalories === undefined && minProtein === undefined) return meal;

  const totalCalories = meal.calories * meal.servings;
  const totalProtein = meal.protein * meal.servings;
  const totalPrice = meal.price * meal.servings;

  const minServings = Math.max(1, Math.ceil(meal.servings / 2));
  const maxServings = meal.servings * 4;

  let best: number | null = null;
  for (let s = minServings; s <= maxServings; s++) {
    const caloriesPerServing = totalCalories / s;
    const proteinPerServing = totalProtein / s;
    if (maxCalories !== undefined && caloriesPerServing > maxCalories) continue;
    if (minProtein !== undefined && proteinPerServing < minProtein) continue;
    best = s;
    break;
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
