import type { CompareUnit } from './referenceCompare';

const NAME_SIZE_UNITS: Array<[RegExp, CompareUnit]> = [
  [/^(kilograms?|kg)$/, 'kg'],
  [/^(grams?|gr|g)$/, 'g'],
  [/^(millilitres?|milliliters?|ml)$/, 'ml'],
  [/^(litres?|liters?|l)$/, 'L'],
  [/^(pounds?|lbs?)$/, 'lb'],
  [/^(ounces?|oz)$/, 'oz'],
];

// A stated pack size anywhere in a flyer name -- "AROY-D COCONUT MILK,
// 400 ML", "KRAFT SINGLES, 410 g", "FARMERS MARKET CARROTS, 5 LB".
const SIZE_TOKEN = /(\d+(?:\.\d+)?)\s*(kilograms?|kg|grams?|gr|g|millilitres?|milliliters?|ml|litres?|liters?|l|pounds?|lbs?|ounces?|oz)\b/gi;

function toCompareUnit(unitText: string): CompareUnit | undefined {
  const text = unitText.toLowerCase();
  for (const [pattern, unit] of NAME_SIZE_UNITS) {
    if (pattern.test(text)) return unit;
  }
  return undefined;
}

// Last resort when a deal row carries no package_weight_g or
// package_volume_ml: most flyer names state the size themselves.
// Without this, such a row loads as "1 ea" and the mass/volume guard
// blocks any comparison against a weight/volume reference.
//
// A parsed size is a GUESS (a range like "234-284 G" yields its upper
// bound), so callers flag it rather than presenting it as fact, and it
// never overrides a real stored package size. Takes the LAST match,
// since a brand or product word can carry a stray number earlier on.
export function sizeFromItemName(name: string): { quantity: string; unit: CompareUnit } | undefined {
  const matches = [...name.matchAll(SIZE_TOKEN)];
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const unit = toCompareUnit(matches[index][2]);
    if (unit) return { quantity: matches[index][1], unit };
  }
  return undefined;
}

// One flyer cutout often prices several distinct products together --
// "choose either of these at this price". Anabelle, on
// "UNICO OLIVES 375 mL, CAPERS, 125 mL or HOT PEPPER RINGS, 750 mL":
// "i should see it 3 times". Each product needs its own package size
// (375 vs 125 vs 750 mL) and its own reference, so they can't share
// one review.
//
// Splitting on the word "or" alone isn't enough -- that example joins
// its first two products with a COMMA and only the last with "or", and
// a comma is also what separates a product from its own size ("CAPERS,
// 125 mL"). The rule that actually holds: a product ends at its stated
// SIZE, so cut immediately after each size token and strip whatever
// joins the next one ("," / "or" / "/"). That yields the three names
// above exactly.
//
// Falls back to splitting on a standalone "or" when no sizes are
// stated (e.g. "Iceberg or Living Lettuce"), matching the rule
// dev-deals' own Duplicate button already gates on. Returns a
// single-element array for an ordinary one-product name -- callers
// treat length > 1 as "this cutout needs splitting".
export function splitMultiItemName(name: string): string[] {
  const parts: string[] = [];
  let cursor = 0;
  for (const match of name.matchAll(SIZE_TOKEN)) {
    if (!toCompareUnit(match[2])) continue;
    const end = match.index + match[0].length;
    const part = name.slice(cursor, end).replace(/^[\s,/]*(?:or\b)?[\s,/]*/i, '').trim();
    if (part) parts.push(part);
    cursor = end;
  }
  // Anything after the final size (rare -- a trailing "each", a
  // qualifier) belongs to the last product rather than becoming a
  // product of its own.
  const tail = name.slice(cursor).replace(/^[\s,/]*(?:or\b)?[\s,/]*/i, '').trim();
  if (tail && parts.length > 0) parts[parts.length - 1] = `${parts[parts.length - 1]}, ${tail}`;

  if (parts.length > 1) return parts;

  const orParts = name
    .split(/\bor\b/i)
    .map((part) => part.replace(/^[\s,/]+|[\s,/]+$/g, ''))
    .filter((part) => part.length > 0);
  if (orParts.length > 1) return orParts;

  return [name];
}
