import { supabase } from './supabase';
import type { SubRecipe } from './mealData';

interface SubRecipeRow {
  title: string;
  match_ingredient_name: string;
  description: string;
  // jsonb columns -- generated types widen these to `Json`, but they're
  // always authored as plain string arrays (see the migration).
  ingredients: unknown;
  instructions: unknown;
}

function mapSubRecipe(row: SubRecipeRow): SubRecipe {
  return {
    title: row.title,
    matchIngredientName: row.match_ingredient_name,
    description: row.description,
    ingredients: (row.ingredients as string[]) ?? [],
    instructions: (row.instructions as string[]) ?? [],
  };
}

// Every sub-recipe in the shared table (small, page-content-only --
// never priced/nutrition-counted, see supabase/migrations/20260812150000_sub_recipes.sql).
// lib/recipes.ts cross-references these against each meal's own
// ingredient names, so a meal only ever ends up with the sub-recipes
// actually relevant to it.
export async function fetchSubRecipes(): Promise<SubRecipe[]> {
  const { data, error } = await supabase
    .from('sub_recipes')
    .select('title, match_ingredient_name, description, ingredients, instructions');
  if (error) throw error;
  return (data ?? []).map(mapSubRecipe);
}
