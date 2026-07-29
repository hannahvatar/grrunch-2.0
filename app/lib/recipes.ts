import { supabase } from './supabase';
import type { DealTag, Meal } from './mealData';

interface RecipeIngredient {
  name: string;
  quantity: string;
  unit: string;
}

interface RecipeDealTagRow {
  name: string;
  discount_pct: number;
}

// Ingredients are stored structured ({name, quantity, unit}) so a future
// Grocery List Generator can consolidate across meals -- flattened to
// display strings here since the UI (recipe.tsx, meals.tsx) only renders
// plain ingredient lines, matching the Meal shape mealData.ts already uses.
function ingredientLine(ingredient: RecipeIngredient): string {
  return [ingredient.quantity, ingredient.unit, ingredient.name].filter(Boolean).join(' ').trim();
}

function mapDealTag(tag: RecipeDealTagRow): DealTag {
  return { name: tag.name, discountPct: tag.discount_pct };
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
  return {
    id: row.id,
    name: row.name,
    price: row.price ?? 0,
    minutes: row.minutes ?? 0,
    servings: row.servings ?? 1,
    dealTags: ((row.deal_tags as RecipeDealTagRow[]) ?? []).map(mapDealTag),
    calories: row.calories ?? 0,
    protein: row.protein ?? 0,
    ingredients: (row.ingredients as RecipeIngredient[]).map(ingredientLine),
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
