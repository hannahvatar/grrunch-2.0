import { supabase } from './supabase';
import type { DealTag, IngredientLine, Meal } from './mealData';

interface RecipeIngredient {
  name: string;
  quantity: string;
  unit: string;
}

interface RecipeDealTagRow {
  name: string;
  discount_pct: number;
  store?: string;
  image_url?: string;
}

function mapDealTag(tag: RecipeDealTagRow): DealTag {
  return { name: tag.name, discountPct: tag.discount_pct, store: tag.store, imageUrl: tag.image_url };
}

// Ingredients are stored structured ({name, quantity, unit}) so a future
// Grocery List Generator can consolidate across meals -- flattened to a
// display string here, with the matching deal tag (by ingredient name)
// attached when that ingredient was sourced from a real flyer deal, so the
// grocery list can show its image/store next to the item.
function mapIngredient(ingredient: RecipeIngredient, dealTags: DealTag[]): IngredientLine {
  const text = [ingredient.quantity, ingredient.unit, ingredient.name].filter(Boolean).join(' ').trim();
  const dealTag = dealTags.find((tag) => tag.name === ingredient.name);
  return { text, dealTag };
}

function mapRowToMeal(row: {
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
}): Meal {
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
      mapIngredient(ingredient, dealTags)
    ),
    instructions: row.instructions as string[],
  };
}

export async function fetchAllRecipes(): Promise<Meal[]> {
  const { data, error } = await supabase.from('recipes').select('*');
  if (error) throw error;
  return (data ?? []).map(mapRowToMeal);
}

export async function fetchRecipeById(id: string): Promise<Meal | null> {
  const { data, error } = await supabase.from('recipes').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapRowToMeal(data) : null;
}

export async function fetchRecipesByIds(ids: string[]): Promise<Meal[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('recipes').select('*').in('id', ids);
  if (error) throw error;
  return (data ?? []).map(mapRowToMeal);
}
