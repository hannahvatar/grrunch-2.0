import { supabase } from './supabase';

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
}

const UNCATEGORIZED = 'Other';

function mapRowToDeal(row: {
  id: string;
  chain_name: string;
  item_name: string;
  category: string | null;
  price: number;
  original_price: number;
  discount_pct: number;
  product_url: string;
  image_url: string | null;
}): Deal {
  return {
    id: row.id,
    chainName: row.chain_name,
    itemName: row.item_name,
    category: row.category ?? UNCATEGORIZED,
    price: row.price,
    originalPrice: row.original_price,
    discountPct: row.discount_pct,
    productUrl: row.product_url,
    imageUrl: row.image_url,
  };
}

export async function fetchAllDeals(): Promise<Deal[]> {
  const { data, error } = await supabase.from('curated_deals').select('*');
  if (error) throw error;
  return (data ?? []).map(mapRowToDeal);
}

export async function fetchDealsByIds(ids: string[]): Promise<Deal[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('curated_deals').select('*').in('id', ids);
  if (error) throw error;
  return (data ?? []).map(mapRowToDeal);
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

export function matchItemStore(ingredientName: string, deals: Deal[]): string | undefined {
  const ingredientWords = normalizeWords(ingredientName);
  if (ingredientWords.length === 0) return undefined;
  let best: string | undefined;
  let bestExtraWords = Infinity;
  for (const deal of deals) {
    const dealWords = normalizeWords(deal.itemName);
    if (ingredientWords.every((word) => dealWords.includes(word))) {
      const extra = dealWords.length - ingredientWords.length;
      if (extra <= MAX_EXTRA_WORDS && extra < bestExtraWords) {
        best = deal.chainName;
        bestExtraWords = extra;
      }
    }
  }
  return best;
}
