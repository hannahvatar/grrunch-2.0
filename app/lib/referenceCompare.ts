import { parseUnitAmount } from './unitConversion';

// The unit selector's options. g/kg/ml/L/ea are the wireframe's own
// list; lb/oz are added because Canadian flyers price by the pound
// constantly (the Safeway ground beef in the review queue is $8.99/lb)
// and several produce_reference_prices rows are denominated "1 lbs" --
// without them, every per-pound price would have to be converted to
// metric by hand before it could be typed in, which is the exact chore
// this screen exists to remove. Anabelle confirmed adding them.
export const COMPARE_UNIT_OPTIONS = ['g', 'kg', 'ml', 'L', 'ea', 'lb', 'oz'] as const;
export type CompareUnit = (typeof COMPARE_UNIT_OPTIONS)[number];

// Everything is restated per 100 g / per 100 ml / per single unit
// before anything is compared -- the wireframe's "normalized -> per
// 100g" line. 100 is the denominator StatCan's own tables and most
// shelf tags already use, so a normalized number can be eyeballed
// against a reference row without a second conversion.
export type BasisLabel = '100g' | '100ml' | 'ea';

export type Verdict = 'LOWER' | 'HIGHER' | 'SAME';

// What the item's price is being judged against. 'previous' is the
// flyer's own was-price (the store's own claim, always the better
// benchmark when it exists); 'reference' is a StatCan/produce/staple
// row (what we fall back to when the flyer prints no was-price).
export type Benchmark =
  | { kind: 'previous'; price: number }
  | { kind: 'reference'; price: number; per: string; unit: string };

export interface Comparison {
  itemPerBasis: number;
  benchmarkPerBasis: number;
  basisLabel: BasisLabel;
  verdict: Verdict;
  // Absolute per-basis gap, e.g. 0.29 for "$0.29 lower".
  difference: number;
  // Signed, negative when the item is cheaper -- the wireframe's
  // "-25% vs benchmark".
  differencePct: number;
  // "reference" or "previous price", for the verdict sentence.
  benchmarkNoun: string;
}

export type ComparisonOutcome = { ok: true; comparison: Comparison } | { ok: false; reason: string };

function basisFor(baseUnit: 'g' | 'ml' | 'each'): { label: BasisLabel; per: number } {
  if (baseUnit === 'g') return { label: '100g', per: 100 };
  if (baseUnit === 'ml') return { label: '100ml', per: 100 };
  return { label: 'ea', per: 1 };
}

// Price restated on the 100 g / 100 ml / per-unit basis. Returns
// undefined rather than a number whenever the quantity can't be read --
// same policy the rest of the pricing code follows (a wrong number here
// becomes a wrong approve/reject decision).
function perBasis(price: number, quantity: string, unit: string): { value: number; baseUnit: 'g' | 'ml' | 'each'; label: BasisLabel } | undefined {
  const parsed = parseUnitAmount(quantity, unit);
  if (Number.isNaN(parsed.amount) || parsed.amount <= 0) return undefined;
  const basis = basisFor(parsed.baseUnit);
  return { value: (price / parsed.amount) * basis.per, baseUnit: parsed.baseUnit, label: basis.label };
}

export function compare(
  itemPrice: number,
  quantity: string,
  unit: string,
  benchmark: Benchmark
): ComparisonOutcome {
  if (!Number.isFinite(itemPrice) || itemPrice <= 0) {
    return { ok: false, reason: 'Enter the price shown on the flyer.' };
  }

  const item = perBasis(itemPrice, quantity, unit);
  if (!item) return { ok: false, reason: `Couldn't read a quantity from "${quantity} ${unit}".` };

  let benchmarkValue: number;
  let benchmarkNoun: string;

  if (benchmark.kind === 'previous') {
    if (!Number.isFinite(benchmark.price) || benchmark.price <= 0) {
      return { ok: false, reason: 'Enter the previous price, or clear it to compare against a reference.' };
    }
    // The was-price is a price for the SAME package, so it normalizes
    // over the item's own quantity -- never a separately stated one.
    const previous = perBasis(benchmark.price, quantity, unit);
    if (!previous) return { ok: false, reason: `Couldn't read a quantity from "${quantity} ${unit}".` };
    benchmarkValue = previous.value;
    benchmarkNoun = 'previous price';
  } else {
    if (!Number.isFinite(benchmark.price) || benchmark.price <= 0) {
      return { ok: false, reason: 'Enter the reference price.' };
    }
    const reference = perBasis(benchmark.price, benchmark.per, benchmark.unit);
    if (!reference) {
      return { ok: false, reason: `Couldn't read the reference quantity "${benchmark.per} ${benchmark.unit}".` };
    }
    // The mismatch guard: grams and millilitres are different physical
    // dimensions, and "$1.20 per 100 ml" says nothing about what 750 g
    // should cost. Blocked rather than bridged -- the density bridges
    // used in recipe pricing are keyed to specific ingredient names and
    // don't generalize to an arbitrary reviewed item.
    if (reference.baseUnit !== item.baseUnit) {
      return {
        ok: false,
        reason: `Can't compare ${describeDimension(item.baseUnit)} against a reference priced by ${describeDimension(reference.baseUnit)}. Pick a reference in the same kind of unit.`,
      };
    }
    benchmarkValue = reference.value;
    benchmarkNoun = 'reference';
  }

  const difference = item.value - benchmarkValue;
  // A gap under half a cent per basis can't be shown at 2 decimal
  // places -- calling that LOWER would print "$0.00 lower", so it reads
  // as SAME instead.
  const verdict: Verdict = Math.abs(difference) < 0.005 ? 'SAME' : difference < 0 ? 'LOWER' : 'HIGHER';

  return {
    ok: true,
    comparison: {
      itemPerBasis: item.value,
      benchmarkPerBasis: benchmarkValue,
      basisLabel: item.label,
      verdict,
      difference: Math.abs(difference),
      differencePct: (difference / benchmarkValue) * 100,
      benchmarkNoun,
    },
  };
}

function describeDimension(baseUnit: 'g' | 'ml' | 'each'): string {
  if (baseUnit === 'g') return 'weight';
  if (baseUnit === 'ml') return 'volume';
  return 'a count';
}

export function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

// "Item is $0.29 lower than reference" / "... higher than previous
// price" / "Item matches the reference exactly".
export function formatVerdictSentence(comparison: Comparison): string {
  if (comparison.verdict === 'SAME') return `Item matches the ${comparison.benchmarkNoun} exactly`;
  const direction = comparison.verdict === 'LOWER' ? 'lower' : 'higher';
  return `Item is ${formatMoney(comparison.difference)} ${direction} than ${comparison.benchmarkNoun}`;
}

// "-25% vs benchmark" -- signed, so a worse price reads "+13%".
export function formatPctVsBenchmark(comparison: Comparison): string {
  const rounded = Math.round(comparison.differencePct);
  return `${rounded > 0 ? '+' : ''}${rounded}% vs benchmark`;
}

const REFERENCE_UNIT_WORDS: Array<[RegExp, CompareUnit]> = [
  [/kilogram|\bkg\b/, 'kg'],
  [/pound|\blbs?\b/, 'lb'],
  [/ounce|\boz\b/, 'oz'],
  [/millilitre|milliliter|\bml\b/, 'ml'],
  [/litre|liter|\bl\b/, 'L'],
  [/gram|\bgr\b|\bg\b/, 'g'],
];

// Reference tables store a denomination as one free-text string --
// "750 grams", "per kilogram", "1 lbs", "1134 g", "890 millilitres",
// "package of 8". Splits that into the PER + UNIT pair the form shows,
// keeping the reference's own denomination rather than converting it,
// so the number on screen still matches the number in the table.
// Anything unrecognized falls back to a count ("ea"), which is what
// parse_unit_amount does with it too.
export function splitReferenceUnit(unit: string): { per: string; unit: CompareUnit } {
  const text = (unit ?? '').trim().toLowerCase();
  const leading = text.match(/^([\d.]+)/);
  const per = leading ? leading[1] : '1';
  for (const [pattern, compareUnit] of REFERENCE_UNIT_WORDS) {
    if (pattern.test(text)) return { per, unit: compareUnit };
  }
  return { per, unit: 'ea' };
}

// What the benchmark works out to for the WHOLE stated quantity, rather
// than per basis -- e.g. the reference cost of one 750 g package. This
// is the number that belongs in curated_deals.original_price when
// original_price_source is 'reference' ("we calculated it"), which is
// what dev-deals' fill button writes into the field.
export function benchmarkCostForQuantity(
  comparison: Comparison,
  quantity: string,
  unit: string
): number | undefined {
  const parsed = parseUnitAmount(quantity, unit);
  if (Number.isNaN(parsed.amount) || parsed.amount <= 0) return undefined;
  const per = comparison.basisLabel === 'ea' ? 1 : 100;
  return Math.round(comparison.benchmarkPerBasis * (parsed.amount / per) * 100) / 100;
}

// A "regular price" several times the sale price doesn't exist in a
// grocery flyer. When the benchmark comes out that far above the item,
// the cause is almost always a unit mix-up rather than a spectacular
// deal -- the case that prompted this guard: "Unico Pizza Sauce" at
// $1.00 was compared against a "Pizza sauce $2.50 / jar" reference with
// QTY 213 (the millilitres off the label) and UNIT left on 'ea', so the
// benchmark was computed as 213 JARS = $532.50, a 99.8% "discount"
// that would have shown shoppers a purple "100% below" badge.
//
// 5x is deliberately loose -- it passes any real markdown (half price,
// even 75% off) and only catches arithmetic that can't describe a real
// shelf. Callers refuse to WRITE such a benchmark rather than quietly
// substituting one, since the reviewer is the only one who can say
// whether the unit or the reference is wrong.
export const IMPLAUSIBLE_BENCHMARK_RATIO = 5;

export function isImplausibleBenchmark(comparison: Comparison): boolean {
  return comparison.benchmarkPerBasis > comparison.itemPerBasis * IMPLAUSIBLE_BENCHMARK_RATIO;
}
