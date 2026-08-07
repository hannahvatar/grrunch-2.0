import { supabase } from './supabase';

export interface DealNutrition {
  itemName: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  packageGrams: number | null;
  basis: 'per_100g' | 'per_100ml';
}

const STOPWORDS = new Set(['with', 'from', 'each', 'selected', 'variety', 'varieties', 'fresh', 'frozen']);

// Mirrors normalize_words() (Postgres) / staplePrices.ts / unitConversion.ts --
// same rule everywhere in this codebase.
function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOPWORDS.has(word));
}

// Only reviewed rows -- see deal_item_nutrition_reference.reviewed_by
// (Phase 1 of the nutrition pipeline): nothing in the app should trust an
// AI-matched value a human hasn't checked.
export async function fetchDealNutrition(): Promise<DealNutrition[]> {
  const { data, error } = await supabase
    .from('deal_item_nutrition_reference')
    .select('item_name, calories_per_100g, protein_per_100g, package_grams, basis')
    .not('reviewed_by', 'is', null);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    itemName: row.item_name,
    caloriesPer100g: row.calories_per_100g,
    proteinPer100g: row.protein_per_100g,
    packageGrams: row.package_grams,
    basis: (row.basis ?? 'per_100g') as 'per_100g' | 'per_100ml',
  }));
}

// Same word-subset match as refresh_recipe_deal_tags/matchStaplePrice: the
// reference's normalized words must all appear in the ingredient's -- most
// specific (most words) match wins. A deal-tagged ingredient's own name
// sometimes carries extra descriptive words beyond the matched deal's exact
// item_name, so this can't assume exact string equality.
export function matchDealNutrition(ingredientName: string, rows: DealNutrition[]): DealNutrition | undefined {
  const ingWords = new Set(normalizeWords(ingredientName));
  let best: DealNutrition | undefined;
  let bestWordCount = 0;
  for (const row of rows) {
    const refWords = normalizeWords(row.itemName);
    if (refWords.length === 0) continue;
    if (refWords.every((word) => ingWords.has(word)) && refWords.length > bestWordCount) {
      best = row;
      bestWordCount = refWords.length;
    }
  }
  return best;
}

// A recipe's "anchor" ingredient -- the deal-tagged item whose serving
// portion should be sized to the Plan tab's protein target (see
// mealScaling.ts) rather than split evenly across the recipe's originally
// authored serving count. Picked as whichever deal-tagged ingredient is
// most protein-dense (>=10g/100g -- separates real protein sources like
// chicken/pork/fish from incidental deal-tagged veg like broccoli or
// peppers, which run 1-3g/100g) and has a known package size (without
// that, there's no way to know how many portions the package yields).
// Recipes with no ingredient clearing this bar (e.g. a pasta dish with no
// single dominant protein item) get no anchor -- mealScaling.ts falls
// back to its older whole-batch model for those.
const MIN_ANCHOR_PROTEIN_PER_100G = 10;

export function findAnchor(
  dealTaggedIngredientNames: string[],
  rows: DealNutrition[]
): DealNutrition | undefined {
  let best: DealNutrition | undefined;
  for (const name of dealTaggedIngredientNames) {
    const match = matchDealNutrition(name, rows);
    if (
      match &&
      match.packageGrams !== null &&
      match.proteinPer100g >= MIN_ANCHOR_PROTEIN_PER_100G &&
      (best === undefined || match.proteinPer100g > best.proteinPer100g)
    ) {
      best = match;
    }
  }
  return best;
}
