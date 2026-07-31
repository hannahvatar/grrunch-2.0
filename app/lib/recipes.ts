import { supabase } from './supabase';
import type { DealTag, IngredientLine, Meal } from './mealData';
import { fetchStaplePrices, matchStaplePrice, type StaplePrice } from './staplePrices';

interface RecipeIngredient {
  name: string;
  quantity: string;
  unit: string;
}

interface RecipeDealTagRow {
  name: string;
  discount_pct: number;
  price?: number;
  original_price?: number;
  store?: string;
  image_url?: string;
  quantity_estimated?: boolean;
}

function mapDealTag(tag: RecipeDealTagRow): DealTag {
  return {
    name: tag.name,
    discountPct: tag.discount_pct,
    price: tag.price,
    originalPrice: tag.original_price,
    store: tag.store,
    imageUrl: tag.image_url,
    quantityEstimated: tag.quantity_estimated,
  };
}

// Ingredients are stored structured ({name, quantity, unit}) so a future
// Grocery List Generator can consolidate across meals -- flattened to a
// display string here, with the matching deal tag (by ingredient name)
// attached when that ingredient was sourced from a real flyer deal, so the
// grocery list can show its image/store next to the item. When there's no
// deal, falls back to a generic staple price estimate if one matches --
// never both, and never a guess when neither applies.
function mapIngredient(
  ingredient: RecipeIngredient,
  dealTags: DealTag[],
  staples: StaplePrice[]
): IngredientLine {
  const text = [ingredient.quantity, ingredient.unit, ingredient.name].filter(Boolean).join(' ').trim();
  const dealTag = dealTags.find((tag) => tag.name === ingredient.name);
  if (dealTag) return { text, dealTag };
  const staple = matchStaplePrice(ingredient.name, staples);
  return { text, estimatedPrice: staple ? { avgPrice: staple.avgPrice, unit: staple.unit } : undefined };
}

function mapRowToMeal(
  row: {
    id: string;
    name: string;
    ingredients: unknown;
    instructions: unknown;
    deal_tags: unknown;
    calories: number | null;
    protein: number | null;
    minutes: number | null;
    price: number | null;
    servings: number;
  },
  staples: StaplePrice[]
): Meal {
  const dealTags = ((row.deal_tags as RecipeDealTagRow[]) ?? []).map(mapDealTag);
  return {
    id: row.id,
    name: row.name,
    price: row.price ?? 0,
    minutes: row.minutes ?? 0,
    servings: row.servings ?? 1,
    dealTags,
    calories: row.calories ?? 0,
    protein: row.protein ?? 0,
    ingredients: (row.ingredients as RecipeIngredient[]).map((ingredient) =>
      mapIngredient(ingredient, dealTags, staples)
    ),
    instructions: row.instructions as string[],
  };
}

export async function fetchAllRecipes(): Promise<Meal[]> {
  const [{ data, error }, staples] = await Promise.all([
    supabase.from('recipes').select('*'),
    fetchStaplePrices(),
  ]);
  if (error) throw error;
  return (data ?? []).map((row) => mapRowToMeal(row, staples));
}

export async function fetchRecipeById(id: string): Promise<Meal | null> {
  const [{ data, error }, staples] = await Promise.all([
    supabase.from('recipes').select('*').eq('id', id).maybeSingle(),
    fetchStaplePrices(),
  ]);
  if (error) throw error;
  return data ? mapRowToMeal(data, staples) : null;
}

export async function fetchRecipesByIds(ids: string[]): Promise<Meal[]> {
  if (ids.length === 0) return [];
  const [{ data, error }, staples] = await Promise.all([
    supabase.from('recipes').select('*').in('id', ids),
    fetchStaplePrices(),
  ]);
  if (error) throw error;
  return (data ?? []).map((row) => mapRowToMeal(row, staples));
}
