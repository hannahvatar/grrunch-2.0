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
  'chili flakes': 80,
  // 0.92 g/mL, standard olive oil density -- see
  // 20260807050000_olive_oil_density.sql for why this matters: without
  // it, olive oil (measured in mL in every recipe using it) silently
  // contributed 0 to both price and nutrition, in 6 of 9 recipes.
  'olive oil': 217.7,
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

// Scales a recipe ingredient's own stated quantity by a whole-batch
// multiplier (e.g. "4.5" cups doubled -> "9") -- used only for staple
// ingredients, whose amount genuinely grows with batch count (unlike a
// deal-tagged package, which is never fragmented; see
// lib/mealScaling.ts scaleIngredientDisplay). Returns the quantity
// unchanged when it isn't a plain number/fraction (e.g. "to taste" --
// there's nothing to scale) rather than guessing.
export function scaleQuantityString(quantity: string | undefined, multiplier: number): string | undefined {
  const qtyText = (quantity ?? '').trim();
  if (multiplier === 1 || qtyText === '') return quantity;
  const fraction = qtyText.match(/^(\d+)\s*\/\s*(\d+)$/);
  const amount = fraction
    ? parseInt(fraction[1], 10) / parseInt(fraction[2], 10)
    : /^\d+(\.\d+)?$/.test(qtyText)
      ? parseFloat(qtyText)
      : NaN;
  if (Number.isNaN(amount)) return quantity;
  // Rounded to 2 decimals to clear binary-float noise (e.g. 0.1 + 0.2),
  // not because the display itself wants 2 decimal places -- an integer
  // result still prints as "9", not "9.00".
  return String(Math.round(amount * multiplier * 100) / 100);
}

// Builds an ingredient's display text/groceryText from its name and
// quantity/unit -- factored out of mapIngredient() (lib/recipes.ts) so
// scaleIngredientDisplay (lib/mealScaling.ts) can rebuild the same
// strings from a scaled quantity, without re-running staple price
// matching (which doesn't depend on the batch multiplier at all).
export function describeQuantityText(
  name: string,
  quantity: string | undefined,
  unit: string | undefined
): { text: string; groceryText?: string } {
  const dryEquivalent = describeDryEquivalent(name, quantity, unit);
  const unitCount = describeUnitCount(name, quantity, unit);
  const rawText = [quantity, unit, name].filter(Boolean).join(' ').trim();
  // "(cooked)" only on the recipe-page text -- a bare "2 cups Rice"
  // reads as if 2 cups is what to buy, when it's actually the dish's
  // cooked amount (see describeDryEquivalent). The name itself (used for
  // deal/price matching) is untouched, so this is display-only.
  //
  // unitCount (e.g. "1 Onion" for "150 g Onions"), by contrast, isn't a
  // different amount the way dry-vs-cooked is -- it's the exact same
  // quantity in friendlier units, so it replaces `text` everywhere
  // (recipe page included), not just the grocery list.
  const text = dryEquivalent ? `${rawText} (cooked)` : unitCount ?? rawText;
  const groceryText = dryEquivalent ? `${dryEquivalent} ${name}` : unitCount;
  return { text, groceryText };
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
  if (/gram|\bgr\b|\bg\b/.test(t)) return { amount: num, baseUnit: 'g' };
  if (/pound|\blb\b|\blbs\b/.test(t)) return { amount: num * 453.592, baseUnit: 'g' };
  if (/ounce|\boz\b/.test(t)) return { amount: num * 28.3495, baseUnit: 'g' };
  if (/litre|liter|\bl\b/.test(t)) return { amount: num * 1000, baseUnit: 'ml' };
  if (/millilitre|milliliter|\bml\b/.test(t)) return { amount: num, baseUnit: 'ml' };
  if (/tablespoon|\btbsp\b/.test(t)) return { amount: num * 14.7868, baseUnit: 'ml' };
  if (/teaspoon|\btsp\b/.test(t)) return { amount: num * 4.92892, baseUnit: 'ml' };
  if (/cup/.test(t)) return { amount: num * 236.588, baseUnit: 'ml' };
  if (/dozen/.test(t)) return { amount: num * 12, baseUnit: 'each' };
  // A garlic clove is a sub-unit of the whole bulb/head that reference
  // prices are denominated in -- without this, "3 cloves" and "1 bulb"
  // both collapse to a bare 'each' amount and get divided as if they're
  // the same unit, pricing 3 cloves as 3 whole bulbs (10x+ too much).
  // ~10 cloves/bulb is a standard estimate.
  if (/clove/.test(t)) return { amount: num / 10, baseUnit: 'each' };
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

const CUP_FRACTIONS: Array<[number, string]> = [
  [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'],
  [2 / 3, '⅔'], [3 / 4, '¾'], [5 / 6, '⅚'], [7 / 8, '⅞'],
];

function formatCups(amount: number): string {
  const whole = Math.floor(amount);
  const frac = amount - whole;
  for (const [value, symbol] of CUP_FRACTIONS) {
    if (Math.abs(frac - value) < 0.02) {
      return whole > 0 ? `${whole}${symbol} cups` : `${symbol} cup`;
    }
  }
  if (frac < 0.02) return `${whole} cup${whole === 1 ? '' : 's'}`;
  const rounded = Math.round(amount * 100) / 100;
  return `${rounded} cup${rounded === 1 ? '' : 's'}`;
}

// For grocery-list display only: a recipe's stated quantity for a
// cooked-yield staple (e.g. "2 cups Rice") is how much the DISH uses
// once cooked, not what you'd buy off the shelf -- converts to the
// dry-equivalent amount actually needed, e.g. "2 cups" (cooked rice) ->
// "⅔ cup (123 g) dry". Independent of any matched reference price/unit,
// since it only depends on the ingredient's own cooked-yield ratio and
// (optionally) its dry density -- both keyed by ingredient name, same as
// scaleReferencePrice's bridging. Returns undefined when no cooked-yield
// entry matches (most staples, e.g. flour/sugar/oil, aren't cooked-and-
// expanded) or the recipe's quantity isn't a parseable volume.
export function describeDryEquivalent(
  ingredientName: string,
  recipeQuantity: string | undefined,
  recipeUnit: string | undefined
): string | undefined {
  const ua = parseUnitAmount(recipeQuantity, recipeUnit);
  if (Number.isNaN(ua.amount) || ua.baseUnit !== 'ml') return undefined;

  const ingWords = normalizeWords(ingredientName);
  const yieldEntry = Object.entries(STAPLE_COOKED_YIELD_RATIO).find(([name]) => {
    const words = normalizeWords(name);
    return words.length > 0 && words.every((w) => ingWords.includes(w));
  });
  if (!yieldEntry) return undefined;
  const [, ratio] = yieldEntry;

  const dryCups = ua.amount / 236.588 / ratio;

  const densityEntry = Object.entries(STAPLE_DENSITIES_G_PER_CUP).find(([name]) => {
    const words = normalizeWords(name);
    return words.length > 0 && words.every((w) => ingWords.includes(w));
  });
  // Rounded up to the nearest 5 g -- a shopper measuring dry rice off a
  // kitchen scale doesn't need (or want) single-gram precision, and
  // rounding up rather than to nearest never understates what to buy.
  const gramsText = densityEntry ? ` (${roundUpTo5(dryCups * densityEntry[1])} g)` : '';

  return `${formatCups(dryCups)}${gramsText} dry`;
}

function roundUpTo5(n: number): number {
  return Math.ceil(n / 5) * 5;
}

// A deal-tagged ingredient's stated quantity can be a FRACTION of what's
// actually purchased -- deal items are never fragmented (see
// docs/grrunch-architecture.md item 12), so a recipe using "230 g" of a
// bigger chicken pack to hit a nutrition/protein target still means
// buying exactly 1 whole package off the shelf. Display-only, and
// intentionally not folded into describeUnitCount/describeDryEquivalent
// above: those describe the SAME quantity in friendlier units (a
// staple's price still scales with how much you use), where this
// instead REPLACES the quantity, because a deal item's price doesn't
// scale with how much of the package the recipe calls for (a
// sub-package quantity still credits exactly one package price -- see
// refresh_recipe_deal_tags()). Returns undefined when the quantity
// already reads as a package count (e.g. "2 pack", "1 rack", a bare
// whole item like "1 CAULIFLOWER") and needs no override.
export function describeDealPackage(
  recipeQuantity: string | undefined,
  recipeUnit: string | undefined
): string | undefined {
  const ua = parseUnitAmount(recipeQuantity, recipeUnit);
  if (Number.isNaN(ua.amount) || ua.baseUnit === 'each') return undefined;
  return '1 package';
}

// Staples conventionally bought and measured as whole discrete items (a
// whole onion, half an onion) rather than by weight -- lets a recipe's
// gram quantity (needed for accurate pricing, same reasoning as
// STAPLE_DENSITIES_G_PER_CUP) display as a natural kitchen count
// instead. Deliberately small; only add an entry once actually
// confirmed, same policy as the other staple tables.
// Keyed by the plural form -- normalizeWords doesn't stem ("Onions"
// normalizes to "onions", not "onion"), and recipe ingredients are
// consistently written plural ("Onions"), so the singular form used only
// in the display label wouldn't match here.
export const STAPLE_UNIT_WEIGHTS_G: Record<string, { gramsPerUnit: number; singular: string; plural: string }> = {
  onions: { gramsPerUnit: 150, singular: 'Onion', plural: 'Onions' },
};

// Snaps to a coarse kitchen fraction rather than an oddly precise
// decimal: quarters or halves below 1 whole unit, halves above it.
function snapUnitCount(amount: number): number {
  if (amount <= 1.25) {
    const candidates = [0.25, 0.5, 1];
    return candidates.reduce((best, c) => (Math.abs(amount - c) < Math.abs(amount - best) ? c : best));
  }
  return Math.round(amount * 2) / 2;
}

function formatFraction(n: number): string {
  const whole = Math.floor(n);
  const frac = n - whole;
  const fracLabel = frac === 0.25 ? '¼' : frac === 0.5 ? '½' : frac === 0.75 ? '¾' : '';
  if (whole === 0) return fracLabel || `${n}`;
  return fracLabel ? `${whole}${fracLabel}` : `${whole}`;
}

// For grocery-list display only, same role as describeDryEquivalent: a
// recipe's gram quantity for a whole-unit staple (e.g. "150 g Onions")
// is what pricing needs, but a shopper thinks in whole onions, not
// grams -- converts to a natural count like "1 Onion" or "½ Onion".
// Returns undefined when the ingredient isn't in STAPLE_UNIT_WEIGHTS_G
// or the recipe's quantity isn't a parseable weight.
export function describeUnitCount(
  ingredientName: string,
  recipeQuantity: string | undefined,
  recipeUnit: string | undefined
): string | undefined {
  const ua = parseUnitAmount(recipeQuantity, recipeUnit);
  if (Number.isNaN(ua.amount) || ua.baseUnit !== 'g') return undefined;

  const ingWords = normalizeWords(ingredientName);
  const entry = Object.entries(STAPLE_UNIT_WEIGHTS_G).find(([name]) => {
    const words = normalizeWords(name);
    return words.length > 0 && words.every((w) => ingWords.includes(w));
  });
  if (!entry) return undefined;
  const [, { gramsPerUnit, singular, plural }] = entry;

  const count = snapUnitCount(ua.amount / gramsPerUnit);
  const label = count > 1 ? plural : singular;
  return `${formatFraction(count)} ${label}`;
}
