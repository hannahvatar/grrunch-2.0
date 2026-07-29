// Meal shape shared by the recipes data layer (lib/recipes.ts) and the
// screens that render it (Meals tab, recipe.tsx, Profile's saved recipes).
export interface Meal {
  id: string;
  name: string;
  price: number;
  minutes: number;
  tag: string;
  calories: number;
  protein: number;
  ingredients: string[];
  instructions: string[];
}
