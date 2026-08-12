import { supabase } from './supabase';
import { scaleReferencePrice } from './unitConversion';

export interface StaplePrice {
  ingredientName: string;
  avgPrice: number;
  unit: string;
}

const STOPWORDS = new Set(['with', 'from', 'each', 'selected', 'variety', 'varieties', 'fresh', 'frozen']);
// See 20260812110000_keep_short_words.sql -- narrow allowlist of
// <=3-char words proven to cause a real wrong match once dropped
// (e.g. "Sesame oil" -> bare "sesame" -> matches "Sesame seeds").
const KEEP_SHORT_WORDS = new Set(['soy', 'oil']);

// Mirrors the Postgres normalize_words() function used by
// refresh_recipe_deal_tags (see supabase/migrations/20260730000000_auto_refresh_deal_tags.sql)
// so staple matching uses the exact same rule as deal matching: strip
// punctuation, lowercase, drop short/generic words, then require every
// word in the shorter (staple) name to appear in the ingredient's name.
// Deliberately conservative -- no brand-substitution guessing here either.
function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((word) => (word.length > 3 || KEEP_SHORT_WORDS.has(word)) && !STOPWORDS.has(word));
}

// Excludes checked_by='ai_estimated' rows -- no AI-guessed prices in the
// trusted chain, only StatCan or an explicitly human-verified entry.
// ai_estimated rows are left in the table (not deleted) as a visible
// "still needs a real price" checklist, just never matched against.
export async function fetchStaplePrices(): Promise<StaplePrice[]> {
  const { data, error } = await supabase
    .from('staple_reference_prices')
    .select('ingredient_name, avg_price, unit')
    .neq('checked_by', 'ai_estimated');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ingredientName: row.ingredient_name,
    avgPrice: row.avg_price,
    unit: row.unit,
  }));
}

// Real, government-sourced BC prices (StatCan table 18-10-0245-01, see
// scripts/sync_statcan_prices.py) -- checked before the AI-guessed
// staple_reference_prices fallback, since these numbers are sourced and
// traceable rather than estimated. Only covers ~100 generic staples, so
// most of Grrunch's specialty/ethnic ingredients still fall through to
// the guessed table.
export async function fetchStatcanPrices(): Promise<StaplePrice[]> {
  const { data, error } = await supabase
    .from('statcan_reference_prices')
    .select('ingredient_name, avg_price, unit');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ingredientName: row.ingredient_name,
    avgPrice: row.avg_price,
    unit: row.unit,
  }));
}

// Human-sourced BC produce prices -- fills the gap StatCan's table
// leaves (it doesn't track most fresh produce). Filled in one item at a
// time via the "Produce Reference Gaps" Airtable table and synced by
// scripts/sync_weekly_deals.py. Checked after StatCan, before the
// AI-guessed staple fallback, since a human actually looked these up.
export async function fetchProducePrices(): Promise<StaplePrice[]> {
  const { data, error } = await supabase
    .from('produce_reference_prices')
    .select('ingredient_name, avg_price, unit');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ingredientName: row.ingredient_name,
    avgPrice: row.avg_price,
    unit: row.unit,
  }));
}

// Extra words allowed when the ingredient is the GENERIC side and the
// reference is a specific variety of it (e.g. ingredient "Rice" vs.
// reference "White rice" -- StatCan splits rice into White/Brown SKUs,
// so a plain "Rice" ingredient would otherwise match neither). Only
// trusted when every extra reference word is one of these -- never an
// arbitrary word -- so "Rice" still correctly does NOT match "Rice
// noodles" ("noodles" isn't a descriptor).
const VARIETY_DESCRIPTORS = new Set([
  'white', 'brown', 'long', 'grain', 'basmati', 'jasmine', 'parboiled', 'instant', 'wild', 'short',
]);

// Specific dry pasta shapes all price the same as StatCan's generic "Dry
// or fresh pasta" reference -- unlike "White rice" (shares the word
// "rice" with "Rice"), "Spaghetti"/"Macaroni"/"Rigatoni" share NO word
// at all with "pasta", so this needs a real synonym map rather than a
// descriptor fallback. Scoped to staple-reference-price matching only --
// never deal-credit matching (matchItemStore/refresh_recipe_deal_tags'
// deal loop), which correctly stays literal per architecture item 12:
// a recipe naming a specific branded pasta on deal should still only
// match that exact deal, not any pasta-shaped ingredient.
const STAPLE_ALIASES: Record<string, string> = {
  spaghetti: 'pasta', spaghettini: 'pasta', macaroni: 'pasta', rigatoni: 'pasta',
  penne: 'pasta', fusilli: 'pasta', rotini: 'pasta', linguine: 'pasta',
  fettuccine: 'pasta', farfalle: 'pasta', orzo: 'pasta', ziti: 'pasta', vermicelli: 'pasta',
};

function aliasWords(words: string[]): string[] {
  return words.map((word) => STAPLE_ALIASES[word] ?? word);
}

// Picks the most specific matching staple whose normalized name is fully
// contained in the ingredient's normalized name -- e.g. "Rice noodles"
// prefers the "Rice noodles" staple over the more generic "Rice" staple,
// since both satisfy the subset check but the former is a closer match.
// Falls back to the reverse direction (ingredient contained in the
// reference, e.g. "Rice" inside "White rice") only via VARIETY_DESCRIPTORS
// above, and only when no strict match was found -- strict matches always
// win. Returns undefined rather than a loose guess when nothing qualifies
// (e.g. branded ingredients not on deal this week).
export function matchStaplePrice(
  ingredientName: string,
  staples: StaplePrice[]
): StaplePrice | undefined {
  const ingredientWordsArr = aliasWords(normalizeWords(ingredientName));
  const ingredientWords = new Set(ingredientWordsArr);
  let best: StaplePrice | undefined;
  let bestWordCount = 0;
  for (const staple of staples) {
    const stapleWords = aliasWords(normalizeWords(staple.ingredientName));
    if (stapleWords.length === 0) continue;
    // A reference name that collapses to a single generic word once
    // "frozen" is stripped (e.g. "Frozen corn" -> "corn") is too weak a
    // signal to trust here -- it would match ANY ingredient containing
    // that word, fresh or not, at the wrong product's price. "fresh" is
    // deliberately NOT included here (unlike the original version of
    // this guard) -- StatCan's only "fresh"-containing entry is "Dry or
    // fresh pasta", which is a genuinely generic, trustworthy reference
    // ("works for either state"), not a narrow variant the way every
    // "Frozen X" entry is -- excluding it blocked all pasta matching for
    // no real protective benefit (no "Fresh X"-only entries exist in the
    // data). Only applies to this reference-price fallback, not deal matching.
    if (stapleWords.length === 1 && /\bfrozen\b/i.test(staple.ingredientName)) continue;
    if (stapleWords.every((word) => ingredientWords.has(word))) {
      if (stapleWords.length > bestWordCount) {
        best = staple;
        bestWordCount = stapleWords.length;
      }
    }
  }
  if (best) return best;

  // "white" is the unmarked default variety (a recipe/ingredient that
  // just says "Rice" conventionally means white rice), so it's weighted
  // cheaper than other descriptors -- makes "White rice" win over "Brown
  // rice" on a tie deterministically, rather than depending on query
  // row order.
  const descriptorCost = (word: string) => (word === 'white' ? 1 : 2);
  let bestCost = Infinity;
  for (const staple of staples) {
    const stapleWords = aliasWords(normalizeWords(staple.ingredientName));
    if (stapleWords.length === 0) continue;
    const stapleWordSet = new Set(stapleWords);
    if (!ingredientWordsArr.every((word) => stapleWordSet.has(word))) continue;
    const extraWords = stapleWords.filter((word) => !ingredientWords.has(word));
    if (extraWords.length === 0) continue; // identical word sets would've matched strict above
    if (!extraWords.every((word) => VARIETY_DESCRIPTORS.has(word))) continue;
    const cost = extraWords.reduce((sum, word) => sum + descriptorCost(word), 0);
    if (cost < bestCost) {
      best = staple;
      bestCost = cost;
    }
  }
  return best;
}

// Three-tier lookup, most-trustworthy source wins regardless of
// word-count specificity: real StatCan data first, then human-sourced
// produce prices (fills the gap StatCan leaves), then human-verified
// staple prices last (never AI-guessed -- see fetchStaplePrices).
//
// The matched reference price is scaled to the ingredient's actual
// quantity (see unitConversion.ts) rather than returned in full -- "1
// tbsp olive oil" should cost a fraction of a "$/100ml" reference, not
// the whole thing. Returns undefined if scaling fails (incompatible
// units, no density bridge) -- an unscaled number would be more
// misleading than no price at all.
export function matchReferencePrice(
  ingredientName: string,
  quantity: string | undefined,
  unit: string | undefined,
  statcanPrices: StaplePrice[],
  producePrices: StaplePrice[],
  staplePrices: StaplePrice[]
): { avgPrice: number; unit: string; source: 'statcan' | 'produce' | 'staple' } | undefined {
  const tiers: Array<[StaplePrice[], 'statcan' | 'produce' | 'staple']> = [
    [statcanPrices, 'statcan'],
    [producePrices, 'produce'],
    [staplePrices, 'staple'],
  ];
  for (const [prices, source] of tiers) {
    const match = matchStaplePrice(ingredientName, prices);
    if (!match) continue;
    const scaled = scaleReferencePrice(quantity, unit, ingredientName, match.avgPrice, match.unit);
    if (scaled === undefined) continue;
    return { avgPrice: scaled, unit: match.unit, source };
  }
  return undefined;
}
