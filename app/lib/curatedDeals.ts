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

// Muted annotation shown in place of a strikethrough original price
// when isReferencePriced() -- same tone as IngredientRow's existing
// itemPriceEstimated ("$X avg.") for a non-deal staple price, plus a
// "compare:" prefix so the two are never confused: this means "here's
// what we're comparing this deal's price against," not "here's the
// typical price for this staple."
export function formatComparePriceLabel(originalPrice: number): string {
  return `compare: $${originalPrice.toFixed(2)} avg.`;
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

const STOPWORDS = new Set(['with', 'from', 'each', 'selected', 'variety', 'varieties', 'fresh', 'frozen']);

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOPWORDS.has(word));
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
