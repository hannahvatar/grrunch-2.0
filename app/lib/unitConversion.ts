// Mirrors supabase/migrations/20260801030000_quantity_aware_staple_pricing.sql
// exactly -- same conversion factors and density table, so the grocery
// list's displayed price always matches what recipes.price was computed
// from server-side. Fixes a real bug: "1 tbsp olive oil" was previously
// priced the same as the reference's FULL package/rate price ($0.90/100ml
// olive oil charged a full $0.90 against a 15ml use, 6x too much).

export type BaseUnit = 'ml' | 'g' | 'each';

export interface UnitAmount {
  amount: number;
  baseUnit: BaseUnit;
}

// Approximate grams-per-cup for common dry/semi-solid staples -- lets a
// recipe stating volume (cups/tbsp) convert to weight when the reference
// price is denominated by weight (or vice versa). Deliberately small and
// approximate; expand as new staples come up rather than guessing.
export const STAPLE_DENSITIES_G_PER_CUP: Record<string, number> = {
  flour: 120,
  sugar: 200,
  'brown sugar': 220,
  'powdered sugar': 120,
  rice: 185,
  oats: 90,
  cornmeal: 120,
  breadcrumbs: 108,
  honey: 340,
  'peanut butter': 258,
  butter: 227,
  'cocoa powder': 84,
  salt: 273,
  'baking soda': 220,
  'baking powder': 192,
};

// A recipe stating "cups of rice" as a dish component means cooked rice,
// not dry rice measured in a cup -- rice roughly triples in volume when
// cooked, so pricing "2 cups rice" against a dry-rice reference without
// this correction overcharges ~3x. Deliberately small; only add an entry
// once actually confirmed, same policy as STAPLE_DENSITIES_G_PER_CUP.
export const STAPLE_COOKED_YIELD_RATIO: Record<string, number> = {
  rice: 3,
};

const STOPWORDS = new Set(['with', 'from', 'each', 'selected', 'variety', 'varieties', 'fresh', 'frozen']);

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOPWORDS.has(word));
}

// Parses a quantity+unit into a normalized (amount, base_unit) pair.
// Handles both recipe-style units (tsp/tbsp/cup/g/ml/each) and
// reference-style units (StatCan's "500 grams", "per kilogram", "unit",
// "1 dozen", or a human's own "per lb"/"454 g" entry).
function parseQuantity(quantity: string | undefined): number {
  const qtyText = (quantity ?? '').trim();
  if (qtyText === '') return 1;
  const fraction = qtyText.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) return parseInt(fraction[1], 10) / parseInt(fraction[2], 10);
  if (/^\d+(\.\d+)?$/.test(qtyText)) return parseFloat(qtyText);
  return NaN; // unparseable (e.g. "to taste") -- propagates to NaN amount, caller treats as unscalable
}

export function parseUnitAmount(quantity: string | undefined, unitText: string | undefined): UnitAmount {
  const qty = parseQuantity(quantity);
  let t = (unitText ?? '').trim().toLowerCase();
  let num: number;

  if (t.startsWith('per ')) {
    t = t.slice(4);
    num = 1;
  } else {
    const match = t.match(/^([\d.]+)/);
    num = (match ? parseFloat(match[1]) : 1) * qty;
  }

  if (/kilogram|\bkg\b/.test(t)) return { amount: num * 1000, baseUnit: 'g' };
  if (/gram|\bg\b/.test(t)) return { amount: num, baseUnit: 'g' };
  if (/pound|\blb\b|\blbs\b/.test(t)) return { amount: num * 453.592, baseUnit: 'g' };
  if (/ounce|\boz\b/.test(t)) return { amount: num * 28.3495, baseUnit: 'g' };
  if (/litre|liter|\bl\b/.test(t)) return { amount: num * 1000, baseUnit: 'ml' };
  if (/millilitre|milliliter|\bml\b/.test(t)) return { amount: num, baseUnit: 'ml' };
  if (/tablespoon|\btbsp\b/.test(t)) return { amount: num * 14.7868, baseUnit: 'ml' };
  if (/teaspoon|\btsp\b/.test(t)) return { amount: num * 4.92892, baseUnit: 'ml' };
  if (/cup/.test(t)) return { amount: num * 236.588, baseUnit: 'ml' };
  if (/dozen/.test(t)) return { amount: num * 12, baseUnit: 'each' };
  return { amount: num, baseUnit: 'each' };
}

// Scales a reference price to the recipe's actual quantity. Returns
// undefined (rather than a guessed number) when the two sides are
// incompatible units and no density entry bridges them -- an unscaled
// full reference price would be more misleading than no price at all.
export function scaleReferencePrice(
  recipeQuantity: string | undefined,
  recipeUnit: string | undefined,
  ingredientName: string,
  refPrice: number,
  refUnit: string
): number | undefined {
  const recipeUa = parseUnitAmount(recipeQuantity, recipeUnit);
  if (Number.isNaN(recipeUa.amount)) return undefined; // unparseable quantity (e.g. "to taste")
  // ref_unit already carries its own amount ("500 grams", "per kilogram")
  // -- quantity=1 makes parseUnitAmount's qty-multiplier a no-op.
  const refUa = parseUnitAmount('1', refUnit);

  if (recipeUa.baseUnit === refUa.baseUnit) {
    return round4(refPrice * (recipeUa.amount / refUa.amount));
  }

  const ingWords = normalizeWords(ingredientName);

  let cookedRatio = 1;
  for (const [yieldName, ratio] of Object.entries(STAPLE_COOKED_YIELD_RATIO)) {
    const yieldWords = normalizeWords(yieldName);
    if (yieldWords.length > 0 && yieldWords.every((w) => ingWords.includes(w))) {
      cookedRatio = ratio;
      break;
    }
  }

  for (const [densityName, gramsPerCup] of Object.entries(STAPLE_DENSITIES_G_PER_CUP)) {
    const densityWords = normalizeWords(densityName);
    if (densityWords.length > 0 && densityWords.every((w) => ingWords.includes(w))) {
      if (recipeUa.baseUnit === 'ml' && refUa.baseUnit === 'g') {
        const dryEquivalentCups = recipeUa.amount / 236.588 / cookedRatio;
        return round4(refPrice * ((dryEquivalentCups * gramsPerCup) / refUa.amount));
      }
      if (recipeUa.baseUnit === 'g' && refUa.baseUnit === 'ml') {
        return round4(refPrice * (((recipeUa.amount / gramsPerCup) * cookedRatio * 236.588) / refUa.amount));
      }
    }
  }

  return undefined; // incompatible units, no density bridge available
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
