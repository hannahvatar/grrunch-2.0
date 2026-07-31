import { supabase } from './supabase';

export interface StaplePrice {
  ingredientName: string;
  avgPrice: number;
  unit: string;
}

const STOPWORDS = new Set(['with', 'from', 'each', 'selected', 'variety', 'varieties', 'fresh', 'frozen']);

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
    .filter((word) => word.length > 3 && !STOPWORDS.has(word));
}

export async function fetchStaplePrices(): Promise<StaplePrice[]> {
  const { data, error } = await supabase
    .from('staple_reference_prices')
    .select('ingredient_name, avg_price, unit');
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

// Picks the most specific matching staple (most words) whose normalized
// name is fully contained in the ingredient's normalized name -- e.g.
// "Rice noodles" prefers the "Rice noodles" staple over the more generic
// "Rice" staple, since both satisfy the subset check but the former is
// a closer match. Returns undefined rather than a loose guess when
// nothing qualifies (e.g. branded ingredients not on deal this week).
export function matchStaplePrice(
  ingredientName: string,
  staples: StaplePrice[]
): StaplePrice | undefined {
  const ingredientWords = new Set(normalizeWords(ingredientName));
  let best: StaplePrice | undefined;
  let bestWordCount = 0;
  for (const staple of staples) {
    const stapleWords = normalizeWords(staple.ingredientName);
    if (stapleWords.length === 0) continue;
    if (stapleWords.every((word) => ingredientWords.has(word))) {
      if (stapleWords.length > bestWordCount) {
        best = staple;
        bestWordCount = stapleWords.length;
      }
    }
  }
  return best;
}

// Three-tier lookup, most-trustworthy source wins regardless of
// word-count specificity: real StatCan data first, then human-sourced
// produce prices (fills the gap StatCan leaves), then the AI-guessed
// staple fallback last.
export function matchReferencePrice(
  ingredientName: string,
  statcanPrices: StaplePrice[],
  producePrices: StaplePrice[],
  staplePrices: StaplePrice[]
): (StaplePrice & { source: 'statcan' | 'produce' | 'estimated' }) | undefined {
  const statcanMatch = matchStaplePrice(ingredientName, statcanPrices);
  if (statcanMatch) return { ...statcanMatch, source: 'statcan' };
  const produceMatch = matchStaplePrice(ingredientName, producePrices);
  if (produceMatch) return { ...produceMatch, source: 'produce' };
  const stapleMatch = matchStaplePrice(ingredientName, staplePrices);
  if (stapleMatch) return { ...stapleMatch, source: 'estimated' };
  return undefined;
}
