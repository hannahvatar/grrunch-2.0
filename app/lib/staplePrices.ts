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

// Two-tier lookup: a real StatCan match always wins over a guessed one,
// regardless of word-count specificity -- sourced data outranks a guess
// even when the guess happens to be a more specific-sounding name.
export function matchReferencePrice(
  ingredientName: string,
  statcanPrices: StaplePrice[],
  staplePrices: StaplePrice[]
): (StaplePrice & { source: 'statcan' | 'estimated' }) | undefined {
  const statcanMatch = matchStaplePrice(ingredientName, statcanPrices);
  if (statcanMatch) return { ...statcanMatch, source: 'statcan' };
  const stapleMatch = matchStaplePrice(ingredientName, staplePrices);
  if (stapleMatch) return { ...stapleMatch, source: 'estimated' };
  return undefined;
}
