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
  // ~90 g/cup for standard grated parmesan -- varies with grate
  // fineness (78-100g/cup across sources), 90 is the commonly-cited
  // midpoint. See staple_densities table (Supabase) for the
  // server-side twin of this entry -- keep both in sync.
  'grated parmesan': 90,
  // ~21 g/cup for loosely packed fresh basil leaves -- see
  // 20260812070000_basil_density.sql for the server-side twin.
  basil: 21,
  // ~96 g/cup for grated ginger -- see 20260812090000_ginger_density.sql
  // for the server-side twin.
  ginger: 96,
  // ~100 g/cup for ground black pepper -- see
  // 20260812130000_black_pepper_density.sql for the server-side twin.
  'black pepper': 100,
  // ~145 g/cup for frozen peas -- see
  // 20260812140000_frozen_peas_density.sql for the server-side twin.
  'frozen peas': 145,
  // 244 g/cup, standard 2% milk density (~1.03 g/mL) -- same bug class
  // as olive oil above: Milk is always measured in mL/tbsp across
  // recipes, and with no density bridge it silently contributed $0/0
  // calories in every recipe using it (Kraft Dinner, Napolitan) until
  // found while adding Froot Loops French Toast. See the staple_densities
  // table (Supabase) for the server-side twin.
  milk: 244,
  // ~128 g/cup for garlic powder -- added as a proper staple (real price
  // + nutrition + density) alongside Paprika below, per Anabelle's ask,
  // while building Pork Back Ribs' cauliflower nugget rewrite. See the
  // staple_densities table (Supabase) for the server-side twin.
  'garlic powder': 128,
  // ~100 g/cup for ground paprika, same figure as ground black pepper.
  'paprika': 100,
  // 218 g/cup, same density as olive oil -- Vegetable oil had a real
  // statcan price but no nutrition and no density bridge, so it
  // silently contributed $0/0 calories despite already being used in
  // Napolitan. Found while rewriting BBQ Ribs 'n' Cauli Nuggets'
  // cauliflower nugget method to use it.
  'vegetable oil': 218,
  // Proactive staple additions (Anabelle: "before generating new
  // recipes, I want to add more staples") -- Peanut butter and Yogurt
  // already had real prices but no nutrition; Cream cheese, Cottage
  // cheese, and Cheez Whiz were missing entirely. All four added here
  // as a preemptive density bridge (no recipe uses them yet), so a
  // future recipe measuring any of these by volume doesn't silently
  // zero out the same way Milk/Vegetable oil did.
  'cream cheese': 232,
  'cottage cheese': 225,
  'cheez whiz': 240,
  yogurt: 245,
  // Second staples batch (Anabelle's own list: Diana sauce, Montreal
  // steak spice, Bull's-Eye, Frank's RedHot, Sriracha, HP sauce,
  // Tabasco, soup/gravy/seasoning mixes, Habitant Pea Soup, Everything
  // bagel seasoning). Only the two loose spice/seasoning blends got a
  // density bridge at the time -- see the correction below, this
  // reasoning turned out to be wrong for the liquid condiments too.
  'montreal steak spice': 140,
  'everything bagel seasoning': 150,
  // Recipe-generation-pipeline round (Burger & Fries, Chinese Eggplant
  // with Ground Beef, Pepperoni Pizza Pasta Skillet) -- both are new
  // staples with no density bridge yet. See the staple_densities table
  // (Supabase) for the server-side twins.
  cornstarch: 120,
  oregano: 33,
  // CORRECTION to the second-batch comment above: "a liquid condiment
  // priced in mL already bridges with no density entry needed" was
  // wrong. That's true for PRICE (recipe mL vs. reference mL match
  // directly), but nutrition always scales against a fixed 100 g basis
  // -- an mL-measured ingredient needs this same density bridge to
  // reach it, or it silently contributes 0 calories despite having
  // real reviewed nutrition. Found here because Ketchup, used by name
  // in "Napolitan (Japanese Ketchup Spaghetti)", was doing exactly
  // that -- its calories jumped 573 -> 604 the moment this bridge was
  // added, with no ingredient change to that recipe at all. Soy sauce
  // and Sesame oil (already used in Honey Garlic Chicken Noodle Toss)
  // had the same gap. Added here for every mL-measured condiment this
  // recipe-gen round actually uses; the rest of the second batch
  // (Diana sauce, Bull's-Eye, Frank's, Sriracha, HP, Tabasco) likely
  // has the same gap but is out of scope for this fix.
  ketchup: 270,
  'dijon mustard': 250,
  'soy sauce': 255,
  'sesame oil': 218,
  // French Fry Sandwich -- Pickles' reference is gram-denominated (400 g,
  // fixed for the Big Mac's slice convention), so a volume-measured "1
  // tbsp, finely chopped" quantity needs this same mL<->g bridge.
  pickles: 240,
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
// Kept even though <=3 characters -- both proven to cause a real wrong
// match once dropped (e.g. "Sesame oil" collapsing to bare "sesame"
// then matching "Sesame seeds"; "Soy sauce" collapsing to bare "sauce"
// then matching "Hot sauce"). See 20260812110000_keep_short_words.sql
// for the server-side twin and the full story -- deliberately a narrow
// allowlist of specific words already proven to collide, not a blanket
// length-threshold change.
const KEEP_SHORT_WORDS = new Set(['soy', 'oil']);

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((word) => (word.length > 3 || KEEP_SHORT_WORDS.has(word)) && !STOPWORDS.has(word));
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
// strings at a whole-batch multiplier, without re-running staple price
// matching (which doesn't depend on the batch multiplier at all).
//
// `quantity` is always the recipe's own NATURAL (1x) amount, never
// pre-scaled by the caller -- multiplier is applied here, differently
// per path: scaled directly into rawText/dryEquivalent (both are exact,
// linear conversions with no rounding grid to land wrong), but passed
// through to describeUnitCount to be applied AFTER its snap-to-nearest-
// fraction step instead (see describeUnitCount for why re-snapping a
// pre-scaled quantity independently breaks predictable doubling).
export function describeQuantityText(
  name: string,
  quantity: string | undefined,
  unit: string | undefined,
  multiplier = 1
): { text: string; groceryText?: string } {
  const scaledQuantity = scaleQuantityString(quantity, multiplier);
  const dryEquivalent = describeDryEquivalent(name, scaledQuantity, unit);
  const unitCount = describeUnitCount(name, quantity, unit, multiplier);
  const rawText = [scaledQuantity, unit, name].filter(Boolean).join(' ').trim();
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

  // Parenthetical weight/volume hint, e.g. "block (200g)" -> 200, 'g' --
  // mirrors supabase/migrations/20260812060000_parenthetical_weight_hint.sql
  // exactly. Checked before anything else -- when present it's always the
  // real, specific figure, regardless of what word it's attached to
  // ("block" itself isn't a recognized unit and would otherwise fall all
  // the way to the 'each' catch-all with amount=1, un-scalable against a
  // gram-denominated reference -- confirmed silently zeroing both this
  // recipe's per-ingredient "$X avg." display AND its server-side price
  // until this fix, for Feta cheese/Firm tofu's "block (Ng)" units).
  const parenMatch = t.match(/\(\s*([\d.]+)\s*(kilograms?|kg|grams?|gr|g|litres?|liters?|l|millilitres?|milliliters?|ml)\s*\)/);
  if (parenMatch) {
    const parenNum = parseFloat(parenMatch[1]);
    const parenUnit = parenMatch[2];
    const parenQty = Number.isNaN(qty) ? 1 : qty;
    if (/^(kilograms?|kg)$/.test(parenUnit)) return { amount: parenQty * parenNum * 1000, baseUnit: 'g' };
    if (/^(litres?|liters?|l)$/.test(parenUnit)) return { amount: parenQty * parenNum * 1000, baseUnit: 'ml' };
    if (/^(millilitres?|milliliters?|ml)$/.test(parenUnit)) return { amount: parenQty * parenNum, baseUnit: 'ml' };
    return { amount: parenQty * parenNum, baseUnit: 'g' };
  }

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
  // millilitre MUST be checked before litre -- "millilitre" contains
  // "litre" as a substring (same relationship as kilogram/gram above,
  // which is correctly ordered specific-first). Found via a real,
  // confirmed bug: StatCan's "Mayonnaise" reference is priced "890
  // millilitres" (spelled out, not "890 mL") -- with litre checked
  // first, that string matched the litre branch and got treated as
  // 890 LITRES (*1000 -> 890,000 mL), a 1000x error that silently
  // rendered "$0.00 avg." for any recipe using it. 13 other rows
  // across staple_reference_prices/statcan_reference_prices use the
  // same spelled-out "NNN millilitres" unit and had the identical bug.
  if (/millilitre|milliliter|\bml\b/.test(t)) return { amount: num, baseUnit: 'ml' };
  if (/litre|liter|\bl\b/.test(t)) return { amount: num * 1000, baseUnit: 'ml' };
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
  // A green onion stalk is a sub-unit of the whole bunch reference
  // prices are denominated in -- same reasoning as clove/bulb above.
  // ~8 stalks/bunch is a standard estimate. See 20260812080000_stalk_unit.sql
  // for the server-side twin.
  if (/stalk/.test(t)) return { amount: num / 8, baseUnit: 'each' };
  return { amount: num, baseUnit: 'each' };
}

// Average grams for one whole/each unit of a countable staple (e.g. one
// large egg ~= 50g) -- bridges an "each"-based recipe quantity ("2 whole
// Eggs") to a gram-denominated reference (a per-gram price, or
// nutrition's fixed "100 g" basis), the each<->g counterpart to
// STAPLE_DENSITIES_G_PER_CUP's ml<->g cup bridge. See staple_avg_weights
// table (Supabase) for the server-side twin -- keep both in sync.
export const STAPLE_AVG_WEIGHT_G_PER_EACH: Record<string, number> = {
  eggs: 50,
  'egg yolks': 17,
  // One pack is 85g -- see 20260812100000_ramen_avg_weight.sql for the
  // server-side twin.
  'instant ramen noodles': 85,
  // One box is 225g -- see 20260812120000_kraft_dinner_avg_weight.sql
  // for the server-side twin.
  'kraft dinner': 225,
  // One pack is 400g -- see the staple_avg_weights row added alongside
  // Honey Garlic Chicken's rice-noodle swap for the server-side twin.
  'rice noodles': 400,
  // ~30g per slice, standard sandwich bread -- see the staple_avg_weights
  // row added alongside Froot Loops French Toast for the server-side twin.
  'white bread': 30,
  // Flatbreads/wraps added for the recipe-generation-pipeline round --
  // see the staple_avg_weights rows added alongside them for the
  // server-side twins.
  'pizza crust': 200, // one 12" pre-baked crust
  naan: 90, // one piece
  pita: 60, // one pocket
  tortillas: 45, // one large flour tortilla
  // Recipe-generation-pipeline round -- package/each-based ingredients
  // (Backyard Burger & Fries, Pepperoni Pizza Pasta Skillet) needed the
  // same each<->gram bridge as Kraft Dinner/White bread/Rice noodles
  // above, or their nutrition (always scaled against a fixed 100 g
  // basis) silently comes back 0 despite a real price/deal match. See
  // the staple_avg_weights table (Supabase) for the server-side twins.
  // Real flyer data (Compliments Traditional Beef Burgers box reads
  // "8 x 113g (4 oz) / NET 907g") -- corrects an earlier 678g/6-pack
  // guess made before Anabelle asked and the real flyer image was
  // checked. Backyard Burger & Fries moved to 8 servings (1 whole
  // package, 1 patty/serving) off the back of this correction --
  // the old 4-serving/half-package version was overpaying per serving
  // anyway, since a "package"-priced deal always charges its flat
  // price regardless of the recipe's stated fraction.
  'beef patties': 907,
  // Real BC package size for Kraft Singles (24-slice, 500g box);
  // 500/24 ~= 21g/slice.
  'kraft singles': 21,
  fries: 650, // matches McCain Superfries' 454-800g flyer range
  'hamburger buns': 43,
  'cheddar cheese slices': 340, // ~16-slice pack
  lettuce: 540, // average iceberg head
  // Redefined from 350 (a whole jar) to 12 (one slice) -- Anabelle's
  // house convention is to count pickles by the slice per serving, not
  // fragment a jar. See the staple_avg_weights row for the server-side
  // twin.
  pickles: 12,
  pepperoni: 900, // matches Roma Pepperoni's 900g flyer size
  // Matches the 150g/onion figure already used by STAPLE_UNIT_WEIGHTS_G
  // for grocery-list display -- Anabelle's house convention is to count
  // onions by the whole/half/quarter, not by weight. See the
  // staple_avg_weights row for the server-side twin.
  onion: 150,
  // French Fry Sandwich -- original ingredient name before Anabelle asked
  // for "your favourite sandwich bread" instead; left in place (unused
  // but harmless) alongside its server-side staple_reference_prices twin,
  // same policy as any other superseded-but-real reference row.
  'whole-wheat ciabatta rolls': 60,
  // French Fry Sandwich's current bread ingredient name. Found missing
  // here (server-side staple_avg_weights had it, this client mirror
  // didn't) when the recipe's bread line showed no price at all.
  'sandwich bread': 60,
  // Pizza Party Pasta -- original ingredient name before Anabelle asked
  // for "Sweet or Bell Peppers" instead; left in place (unused but
  // harmless) alongside its server-side staple_reference_prices twin,
  // same policy as any other superseded-but-real reference row.
  'green bell pepper': 160,
  // Pizza Party Pasta's current name -- matches the recipe's own "3
  // Sweet or Bell Peppers" count convention, same as onion above. Real
  // average weight of one pepper. Deliberately keyed on the FULL "sweet
  // or bell peppers" phrase, not bare "sweet peppers" -- that broader
  // key also word-matched Souvlaki Street Bowl's unrelated "NO NAME
  // NATURALLY IMPERFECT SWEET PEPPERS, 2.5 LB" deal ingredient (a whole
  // 2.5lb BAG, not a single pepper), silently mis-scaling its nutrition
  // down to "1 pepper" (160g) instead of the real ~1134g bag -- a
  // genuine regression caught live (Souvlaki's calories dropped
  // 362->313 the moment the broader key was added). Requiring "bell"
  // too avoids the collision, since Souvlaki's flyer text has no "bell"
  // in it. See the staple_avg_weights row for the server-side twin.
  'sweet or bell peppers': 160,
};

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

  for (const [avgWeightName, gramsEach] of Object.entries(STAPLE_AVG_WEIGHT_G_PER_EACH)) {
    const avgWeightWords = normalizeWords(avgWeightName);
    if (avgWeightWords.length > 0 && avgWeightWords.every((w) => ingWords.includes(w))) {
      if (recipeUa.baseUnit === 'each' && refUa.baseUnit === 'g') {
        return round4(refPrice * ((recipeUa.amount * gramsEach) / refUa.amount));
      }
      // Reverse direction -- a recipe now stating a countable staple in
      // grams (e.g. "600 g Rice noodles") against a per-pack reference
      // price ("$3.00/pack"). Previously only the each-recipe/gram-
      // reference direction above was handled, so a gram-denominated
      // recipe quantity against an each-denominated reference (any
      // "pack"/"box"/"each" unit that doesn't parse to a recognized
      // weight/volume) silently fell through to undefined -- no "$X
      // avg." shown at all, confirmed on Rice noodles once its
      // checked_by was flipped to human_verified.
      if (recipeUa.baseUnit === 'g' && refUa.baseUnit === 'each') {
        return round4(refPrice * (recipeUa.amount / (refUa.amount * gramsEach)));
      }
    }
  }

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

// "Recipe uses 250 g of the package" -- only for a deal explicitly opted
// into fragmentation (DealTag.fragmentByWeight), since only those have a
// price that actually reflects less than the whole package (see
// describeDealPackage above). Factored out here, same reason as
// describeQuantityText: mapIngredient() (lib/recipes.ts) builds it once
// at the recipe's natural (1x) quantity, and scaleIngredientDisplay
// (lib/mealScaling.ts) needs to rebuild the SAME sentence at a scaled
// multiplier when the servings stepper changes -- found missing here
// (Anabelle: "I am bumping the sandwich fries recipes to 4 servings and
// the sentence still says 250 gr") because scaleIngredientDisplay only
// ever rebuilt `text`/`groceryText`, never this.
export function describeUseQuantityText(
  quantity: string | undefined,
  unit: string | undefined,
  multiplier = 1
): string {
  const scaledQuantity = scaleQuantityString(quantity, multiplier);
  return `Recipe uses ${scaledQuantity} ${unit} of the package`.trim();
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
//
// `multiplier` (a whole-batch scale, e.g. 2 for "double the recipe")
// is applied AFTER snapping the recipe's own natural quantity, not
// before -- snapUnitCount only has a coarse quarter/half grid to work
// with, and re-snapping a scaled gram amount independently can land on
// a different grid point purely from where the multiplied total falls
// relative to a whole unit's weight (e.g. 100 g Onions snaps to "½
// Onion", but 200 g -- 2x that same 100 g -- snaps to "1½ Onions", not
// the "1 Onion" doubling ½ would suggest). Scaling the already-snapped
// count instead keeps doubling/tripling/etc. exactly predictable: "½
// Onion" at 1x is always exactly "1 Onion" at 2x, "1½ Onions" at 3x.
export function describeUnitCount(
  ingredientName: string,
  recipeQuantity: string | undefined,
  recipeUnit: string | undefined,
  multiplier = 1
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

  const count = snapUnitCount(ua.amount / gramsPerUnit) * multiplier;
  const label = count > 1 ? plural : singular;
  return `${formatFraction(count)} ${label}`;
}
