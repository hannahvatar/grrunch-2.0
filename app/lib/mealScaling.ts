import type { Meal } from './mealData';
import type { PlanTargets } from './planTargets';

// A recipe's deal-tagged ingredients (see docs/grrunch-architecture.md item
// 12) are bought as whole packages, never fragmented at checkout -- that
// part never changes. But how much of a protein-dense anchor ingredient
// (chicken breast, pork, fish -- see lib/dealNutrition.ts findAnchor) goes
// into a single SERVING is a different question from how the package was
// bought, and doesn't have to be "the whole package split evenly across
// whatever count the recipe author originally wrote down." A person eating
// this dish wants roughly their protein target's worth of that ingredient,
// not a mechanically equal quarter of a family-size pack.
//
// So when a protein target is set and the recipe has an identified anchor,
// its per-serving portion is sized directly to that target (clamped to
// [30g, the whole package] -- never an unrealistically tiny sliver, never
// more than what's actually in the package), and the package's serving
// yield is recomputed from that (floor(packageGrams / portionGrams)) --
// which can come out higher OR lower than the recipe's originally authored
// count. This is still never fragmenting the purchase: exactly one whole
// package is still bought, cooked, and used -- what changes is recognizing
// it might reasonably serve more (smaller, sensible portions) or fewer
// (if the target calls for a bigger portion than the recipe assumed)
// people than the original recipe's guess. The recipe's OTHER fixed
// ingredients (a side vegetable also on the flyer that week, say) keep
// their existing whole-package-total treatment, just divided across
// however many servings the anchor now yields.
//
// Once the anchor portion supplies its (roughly-target) protein, the
// remaining calorie budget is filled by the recipe's flexible staples
// (rice, potatoes, oil...) via the staple multiplier, exactly as before --
// see MIN/MAX_STAPLE_MULTIPLIER. Recipes with no identified anchor (see
// findAnchor's threshold) fall back to the older whole-batch model:
// servings stays whatever was passed in, and the WHOLE fixed total is
// treated as unavoidable, unadjustable per serving.
//
// maxCalories is a ceiling (use the budget, don't blow it); minProtein is
// now something the anchor sizing targets directly, so ordinary overshoot
// should be rare -- MAX_PROTEIN_OVERSHOOT remains as a safety net (e.g. a
// recipe's OTHER fixed ingredients or flexible staples pushing protein up
// further on top of an already-on-target anchor portion), not the primary
// mechanism it was before this existed.
const MIN_STAPLE_MULTIPLIER = 0.5;
const MAX_STAPLE_MULTIPLIER = 3;
const STAPLE_MULTIPLIER_STEP = 0.1;
const MAX_PROTEIN_OVERSHOOT = 1.4; // protein may not exceed 1.4x the floor
const MIN_ANCHOR_PORTION_GRAMS = 30; // never suggest a sliver smaller than this

// Real bug, confirmed live: sizing the anchor portion PURELY to the
// protein target, with no bound on the resulting serving count, let a
// lower-protein-density anchor in a modest package (e.g. wieners, 10g
// protein/100g, 375g package) demand an ~260-300g portion to hit an
// ordinary 26-30g protein target -- more than the WHOLE package could
// give more than one of, collapsing servings to 1. That in turn divided
// the recipe's other fixed/flexible totals (meant for the original 4
// servings) across just that 1, exploding calories per serving to 3-4x
// the recipe's real size and failing the calorie ceiling outright -- the
// same recipe that fit fine at the exact same target when computed with
// the recipe's original serving count. Bounding the anchor-derived
// serving count to the same half-to-4x range used everywhere else this
// session (servingsOptions, the old servings search) keeps a
// low-density anchor from ever ballooning into an unrealistic single
// giant portion: if the bound forces fewer servings than the ideal
// portion would need, the portion shrinks to fit instead (delivering
// less than the full target protein) -- letting the protein-floor check
// reject it honestly, rather than letting portion size explode and
// failing on calories for a confusing, unrelated-looking reason.

export function scaleMealToTargets(meal: Meal, targets: PlanTargets): Meal | null {
  const { maxCalories, minProtein } = targets;
  if (maxCalories === undefined && minProtein === undefined) return meal;

  const totalCalories = meal.calories * meal.servings;
  const totalProtein = meal.protein * meal.servings;
  const totalPrice = meal.price * meal.servings;

  // Whole-recipe (not per-serving) totals -- see mealData.ts. Falls back
  // to treating everything as fixed for rows/recipes with no split data.
  const wholeFixedCalories = meal.fixedCalories ?? totalCalories;
  const wholeFlexibleCalories = meal.flexibleCalories ?? 0;
  const wholeFixedProtein = meal.fixedProtein ?? totalProtein;
  const wholeFlexibleProtein = meal.flexibleProtein ?? 0;
  const wholeFixedPrice = meal.fixedPrice ?? totalPrice;
  const wholeFlexiblePrice = meal.flexiblePrice ?? 0;

  // Dynamic anchor sizing only applies with both an identified anchor and
  // a protein target to size it against -- otherwise fall back to the
  // recipe's own servings, unadjusted, same as before this existed.
  let servings = meal.servings;
  let fixedCaloriesPerServing = wholeFixedCalories / servings;
  let fixedProteinPerServing = wholeFixedProtein / servings;
  let fixedPricePerServing = wholeFixedPrice / servings;

  if (meal.anchor && minProtein !== undefined) {
    const { caloriesPer100g, proteinPer100g, packageGrams } = meal.anchor;
    const idealPortionGrams = Math.min(
      packageGrams,
      Math.max(MIN_ANCHOR_PORTION_GRAMS, (minProtein / proteinPer100g) * 100)
    );
    const rawServings = Math.max(1, Math.floor(packageGrams / idealPortionGrams));
    const minServings = Math.max(1, Math.ceil(meal.servings / 2));
    const maxServings = meal.servings * 4;
    servings = Math.min(maxServings, Math.max(minServings, rawServings));
    // If the bound pushed servings up from what the ideal portion would
    // have needed, shrink the portion to fit what the package can
    // actually supply across that many servings -- delivers less than
    // the full target protein rather than overusing the anchor, and
    // lets the protein-floor check below reject this recipe honestly if
    // that's not enough, instead of the portion silently blowing calories.
    const portionGrams = servings > rawServings ? packageGrams / servings : idealPortionGrams;

    const anchorCaloriesPerServing = (portionGrams / 100) * caloriesPer100g;
    const anchorProteinPerServing = (portionGrams / 100) * proteinPer100g;

    // The rest of the recipe's fixed total (a side vegetable also
    // deal-tagged that week, say) minus what the anchor itself
    // contributes at full package size -- keeps its existing whole-total
    // treatment, just divided across the anchor's new serving yield.
    const anchorWholeCalories = (packageGrams / 100) * caloriesPer100g;
    const anchorWholeProtein = (packageGrams / 100) * proteinPer100g;
    const otherFixedCalories = Math.max(0, wholeFixedCalories - anchorWholeCalories);
    const otherFixedProtein = Math.max(0, wholeFixedProtein - anchorWholeProtein);

    fixedCaloriesPerServing = anchorCaloriesPerServing + otherFixedCalories / servings;
    fixedProteinPerServing = anchorProteinPerServing + otherFixedProtein / servings;
    // Price isn't re-portioned this way -- the whole package is still
    // bought and paid for regardless of how much of it one serving's
    // nutrition profile represents, so it's just spread across however
    // many servings the anchor now yields (more, smaller servings ->
    // cheaper per serving, correctly).
    fixedPricePerServing = wholeFixedPrice / servings;
  }

  const flexCaloriesPerServing = wholeFlexibleCalories / servings;
  const flexProteinPerServing = wholeFlexibleProtein / servings;
  const flexPricePerServing = wholeFlexiblePrice / servings;
  const hasFlexibleIngredients = flexCaloriesPerServing > 0 || flexProteinPerServing > 0;

  const multiplierRange = hasFlexibleIngredients
    ? rangeInclusive(MIN_STAPLE_MULTIPLIER, MAX_STAPLE_MULTIPLIER, STAPLE_MULTIPLIER_STEP)
    : [1];

  let bestMultiplier: number | null = null;
  let bestScore = Infinity;

  for (const k of multiplierRange) {
    const caloriesPerServing = fixedCaloriesPerServing + k * flexCaloriesPerServing;
    const proteinPerServing = fixedProteinPerServing + k * flexProteinPerServing;
    if (maxCalories !== undefined && caloriesPerServing > maxCalories) continue;
    if (minProtein !== undefined && proteinPerServing < minProtein) continue;
    if (minProtein !== undefined && proteinPerServing > minProtein * MAX_PROTEIN_OVERSHOOT) continue;

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

  const finalCaloriesPerServing = fixedCaloriesPerServing + bestMultiplier * flexCaloriesPerServing;
  const finalProteinPerServing = fixedProteinPerServing + bestMultiplier * flexProteinPerServing;
  const finalPricePerServing = fixedPricePerServing + bestMultiplier * flexPricePerServing;

  return {
    ...meal,
    servings,
    calories: Math.round(finalCaloriesPerServing),
    protein: Math.round(finalProteinPerServing * 10) / 10,
    price: Math.round(finalPricePerServing * 100) / 100,
    stapleMultiplier: Math.abs(bestMultiplier - 1) > 0.001 ? Math.round(bestMultiplier * 100) / 100 : undefined,
  };
}

// Lets the recipe page's manual servings stepper choose how many whole
// batches to make, on top of whatever base serving count
// scaleMealToTargets already landed on (which, with an anchor, may itself
// differ from the recipe's originally authored count -- see above). Per-
// serving calories/protein/price don't change with batch count -- making
// 2 batches instead of 1 doubles the total food, not what's in each
// serving -- so this only ever updates the displayed serving count, never
// the macros scaleMealToTargets already computed.
export function resizeMealServings(meal: Meal, servings: number): Meal {
  return servings === meal.servings ? meal : { ...meal, servings };
}

// The servings counts resizeMealServings should be called with: whole
// multiples of whatever base serving count is currently showing (the
// recipe's natural yield, or scaleMealToTargets' anchor-derived count when
// it applies), 1x up to 4x -- wide enough to matter, narrow enough that a
// recipe never suggests preparing an unrealistic 10 batches at once.
export function servingsOptions(baseServings: number): number[] {
  return [1, 2, 3, 4].map((n) => baseServings * n);
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
