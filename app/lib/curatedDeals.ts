import { supabase } from './supabase';

// 'flyer' means originalPrice is a real price the store printed;
// 'reference' means it's a StatCan/human-researched comparison price WE
// derived for a price-only produce item, never printed on any flyer --
// see supabase/migrations/20260812000000_curated_deals_original_price_source.sql.
export type OriginalPriceSource = 'flyer' | 'reference';

export interface Deal {
  id: string;
  chainName: string;
  itemName: string;
  category: string;
  price: number;
  originalPrice: number;
  discountPct: number;
  productUrl: string;
  imageUrl: string | null;
  originalPriceSource: OriginalPriceSource;
  // True when this deal matches at least one recipe ingredient (see
  // curated_deals.used_in_recipe, computed server-side by
  // refresh_recipe_deal_tags() -- never re-derived client-side, since a
  // keyword-fallback match's recipe ingredient name doesn't necessarily
  // equal the deal's own item_name as a string). Lets Weekly Deals
  // exempt a recipe-linked deal from the free-tier per-category cap --
  // Anabelle: "all deals items should also appear in the weekly deals
  // section" (it's core to actually making that recipe, not an upsell).
  usedInRecipe: boolean;
}

const UNCATEGORIZED = 'Other';

// Flyer-sourced deal names come through however the store printed them
// (often ALL CAPS, e.g. "NO NAME® NATURALLY IMPERFECT™ SWEET PEPPERS") --
// title-cased for display only, so matching against the raw name elsewhere
// (grocery list, deal attribution) is unaffected. Shared by MealCard.tsx
// (deal tag chips) and IngredientRow.tsx (recipe page deal item
// descriptions) -- both need the same treatment for the same reason.
export function toTitleCase(text: string): string {
  return text.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

// A produce item approved close to (or even slightly below) its own
// reference price -- e.g. $2.49 vs. a $2.50 reference -- isn't a real
// markdown, just normal week-to-week price variation. Below this
// threshold, show the item (image/price/store) without claiming a
// discount at all, rather than a misleading "Up to 0% off" badge.
export const MIN_DISPLAYED_DISCOUNT_PCT = 5;

// True when this original price is what WE compared against (StatCan/
// human-researched), not what the store printed.
export function isReferencePriced(source: OriginalPriceSource | null | undefined): boolean {
  return source === 'reference';
}

// Every discount-badge-vs-fair-price-badge decision in the app should
// call this instead of a bare `discountPct >= MIN_DISPLAYED_DISCOUNT_PCT`
// -- a 'reference'-sourced original price never counts as a real
// discount no matter how large discountPct is, since the store never
// claimed it. One shared check so the two conditions (big-enough
// discount, and a discount the store actually printed) can't silently
// drift apart between the app's several render sites the way this
// exact class of duplicated logic already has once, server-side (see
// compute_deal_tag_pricing()'s own migration comment).
export function showsRealDiscount(discountPct: number, source: OriginalPriceSource | null | undefined): boolean {
  return discountPct >= MIN_DISPLAYED_DISCOUNT_PCT && !isReferencePriced(source);
}

// A reference-sourced item meaningfully below its own reference price
// is worth calling out as more than a neutral "Fair price" -- but it
// must never look like showsRealDiscount()'s "Up to N% off" badge,
// since the store never claimed this discount, we're the ones
// comparing. 5% is Anabelle's own threshold for "genuinely a good
// price" -- kept as its own constant, not aliased to
// MIN_DISPLAYED_DISCOUNT_PCT, even though they're numerically equal
// today: they answer different questions (real store markdown vs.
// good value against a reference) and either could move independently.
export const GREAT_REFERENCE_VALUE_PCT = 5;

export function isGreatReferenceValue(discountPct: number, source: OriginalPriceSource | null | undefined): boolean {
  return isReferencePriced(source) && discountPct >= GREAT_REFERENCE_VALUE_PCT;
}

// Deliberately "below" not "off" -- "off" implies a markdown from a
// starting price the store set; this is a comparison against an
// external average, phrased so it can never be misread as the former.
// No trailing "avg." (Anabelle's call) -- the badge's own purple color
// already distinguishes it from a real discount claim.
export function formatGreatReferenceValueLabel(discountPct: number): string {
  return `${Math.round(discountPct)}% below`;
}

// Muted annotation shown in place of a strikethrough original price
// when isReferencePriced() -- same tone/style as IngredientRow's
// existing itemPriceEstimated ("$X avg.") for a non-deal staple price.
// Deliberately no "compare:" prefix (Anabelle's call) -- the muted
// styling and "avg." suffix already read as a reference number, not a
// store price, without needing to spell that out.
export function formatComparePriceLabel(originalPrice: number): string {
  return `$${originalPrice.toFixed(2)} avg.`;
}

const GRAMS_PER_PRICE_UNIT: Record<string, number> = { lb: 453.592, kg: 1000, '100g': 100 };

// The "On Sale This Week" badge's number -- distinguishes a genuinely
// loose/bulk lb/kg/100g-priced item (no known package_weight_g, e.g.
// Plantains -- the bare rate, "$1.47/lb", IS the honest number, since
// you pick the exact weight yourself) from a real labeled prepackage
// that's ALSO priced per lb/kg/100g on the flyer (Prime chicken
// breast, a known ~700 g package -- the bare "$6.79/lb" undersells
// what the one package you'd actually pick up costs). Anabelle: "item
// is per weight BUT ALSO prepackage, it is ok here to update its price
// per lbs for the estimated price the package would cost." 'package'/
// 'each' deals are untouched -- rawRate already IS the flat flyer
// price there, no estimation needed.
export function formatDealBadgePrice(
  rawRate: number,
  priceUnit: 'package' | 'each' | 'lb' | 'kg' | '100g' | undefined,
  packageWeightG: number | undefined
): number {
  if (priceUnit && packageWeightG) {
    const gramsPerUnit = GRAMS_PER_PRICE_UNIT[priceUnit];
    if (gramsPerUnit) return Math.round(rawRate * (packageWeightG / gramsPerUnit) * 100) / 100;
  }
  return rawRate;
}


// price/original_price became nullable (see
// supabase/migrations/20260811010000_curated_deals_unknown_price_and_reject.sql
// -- app/app/dev-deals.tsx lets a reviewer mark either as genuinely
// unknown) -- that Edge Function also downgrades status away from
// 'approved' whenever either goes null, so the "approved curated_deals
// are publicly readable" RLS policy (status = 'approved') should never
// actually hand this client a null-priced row. Still returns null
// (filtered out below) rather than asserting/coercing a fake number if
// that invariant is ever wrong, since Deal.price/originalPrice being
// real numbers is what the rest of the app (Best Deals tab) relies on.
function mapRowToDeal(row: {
  id: string;
  chain_name: string;
  item_name: string;
  category: string | null;
  price: number | null;
  original_price: number | null;
  // A generated (price/original_price-derived) column -- Postgres doesn't
  // infer NOT NULL for generated columns even though this one always
  // produces a real number given price/original_price are both required.
  discount_pct: number | null;
  product_url: string;
  image_url: string | null;
  original_price_source: string;
  used_in_recipe: boolean | null;
}): Deal | null {
  if (row.price == null || row.original_price == null) return null;
  return {
    id: row.id,
    chainName: row.chain_name,
    itemName: row.item_name,
    category: row.category ?? UNCATEGORIZED,
    price: row.price,
    originalPrice: row.original_price,
    discountPct: row.discount_pct ?? 0,
    productUrl: row.product_url,
    imageUrl: row.image_url,
    originalPriceSource: row.original_price_source as OriginalPriceSource,
    usedInRecipe: row.used_in_recipe ?? false,
  };
}

export async function fetchAllDeals(): Promise<Deal[]> {
  const { data, error } = await supabase.from('curated_deals').select('*');
  if (error) throw error;
  return (data ?? []).map(mapRowToDeal).filter((deal): deal is Deal => deal !== null);
}

export async function fetchDealsByIds(ids: string[]): Promise<Deal[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('curated_deals').select('*').in('id', ids);
  if (error) throw error;
  return (data ?? []).map(mapRowToDeal).filter((deal): deal is Deal => deal !== null);
}

export function groupDealsByCategory(deals: Deal[]): Map<string, Deal[]> {
  const groups = new Map<string, Deal[]>();
  for (const deal of deals) {
    const existing = groups.get(deal.category);
    if (existing) {
      existing.push(deal);
    } else {
      groups.set(deal.category, [deal]);
    }
  }
  return groups;
}

// Ranks a real, store-printed discount above a reference-sourced
// comparison at the same discountPct -- matches the badge hierarchy
// already shown (showsRealDiscount's green badge outranks
// isGreatReferenceValue's purple one), so "most savings" sorts the same
// way the page visually communicates savings.
function bySavingsDesc(a: Deal, b: Deal): number {
  const aReal = showsRealDiscount(a.discountPct, a.originalPriceSource);
  const bReal = showsRealDiscount(b.discountPct, b.originalPriceSource);
  if (aReal !== bReal) return aReal ? -1 : 1;
  return b.discountPct - a.discountPct;
}

// A deal used by any recipe is exempt from the free-tier cap entirely
// (Anabelle: "all deals items should also appear in the weekly deals
// section" -- it's core to actually making that recipe, not an upsell
// surface) -- always included, on top of whichever non-recipe-linked
// deals the free tier's per-category limit allows through. Those
// remaining slots go to the biggest real savings first (Anabelle:
// "the three that show on the free tier should be the most saving"),
// not whatever order the deals happened to load in.
export function selectVisibleDeals(
  categoryDeals: Deal[],
  isSubscribed: boolean,
  freeLimit: number
): { visibleDeals: Deal[]; lockedDealCount: number } {
  if (isSubscribed) {
    return { visibleDeals: categoryDeals, lockedDealCount: 0 };
  }
  const recipeLinked = categoryDeals.filter((deal) => deal.usedInRecipe);
  const others = categoryDeals.filter((deal) => !deal.usedInRecipe).sort(bySavingsDesc);
  const visibleOthers = others.slice(0, freeLimit);
  return {
    visibleDeals: [...recipeLinked, ...visibleOthers],
    lockedDealCount: others.length - visibleOthers.length,
  };
}

const STOPWORDS = new Set(['with', 'from', 'each', 'selected', 'variety', 'varieties', 'fresh', 'frozen']);
// See 20260812110000_keep_short_words.sql / 20260818000000_keep_red_short_word.sql
// -- narrow allowlist of <=3-char words proven to cause a real wrong
// match once dropped (e.g. "Sesame oil" -> bare "sesame" -> matches
// "Sesame seeds"; "Red onions" -> bare "onions" -> matches plain "Onions").
const KEEP_SHORT_WORDS = new Set(['soy', 'oil', 'red']);

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((word) => (word.length > 3 || KEEP_SHORT_WORDS.has(word)) && !STOPWORDS.has(word));
}

// Finds which store carries an ingredient this week, for grocery-list
// grouping only -- deliberately separate from deal_tags/price crediting.
// An ingredient was genericized (e.g. "Watermelon" instead of "Watermelon
// (Seedless)") specifically to NOT claim a whole-package price it doesn't
// use (see architecture.md section 5, item 12) -- but it's still true and
// useful to say "this week that's at T&T," so the match direction here is
// the reverse of the price-crediting rule: the ingredient's (fewer, more
// generic) words just need to appear within the deal's name, not the
// other way around. Picks the closest match (deal with the fewest extra
// words) to reduce ambiguity when a generic name could fit multiple deals.
//
// Caps how many extra words the deal can have: a single generic staple
// word (e.g. "Rice", "Lemon") would otherwise match ANY deal that happens
// to contain it, however unrelated -- "Rice" matched "Tilda parboiled
// rice" (a specific branded product, not the staple) and "Lemon" matched
// "Fuze iced tea Lemon 12-pack" (a beverage, not actual lemons). A real
// produce match like "Watermelon" -> "Watermelon (Seedless)" only ever
// has one extra word, so requiring <=1 keeps that case while rejecting
// the false-positive brand/product matches.
const MAX_EXTRA_WORDS = 1;

// An extra word here means a genuinely different product, not a variant
// of the same one -- unlike "Watermelon (Seedless)" (still watermelon),
// "Green Onions" are scallions, a different vegetable from the "Onions"
// a recipe actually calls for. Blocked even within MAX_EXTRA_WORDS's
// normal tolerance. Deliberately small; add a word here only once a
// specific false match like this is actually found, not preemptively.
const DIFFERENT_PRODUCT_WORDS = new Set(['green']);

export function matchItemStore(ingredientName: string, deals: Deal[]): string | undefined {
  const ingredientWords = normalizeWords(ingredientName);
  if (ingredientWords.length === 0) return undefined;
  let best: string | undefined;
  let bestExtraWords = Infinity;
  for (const deal of deals) {
    const dealWords = normalizeWords(deal.itemName);
    if (ingredientWords.every((word) => dealWords.includes(word))) {
      const extraWords = dealWords.filter((word) => !ingredientWords.includes(word));
      if (extraWords.some((word) => DIFFERENT_PRODUCT_WORDS.has(word))) continue;
      const extra = extraWords.length;
      if (extra <= MAX_EXTRA_WORDS && extra < bestExtraWords) {
        best = deal.chainName;
        bestExtraWords = extra;
      }
    }
  }
  return best;
}
