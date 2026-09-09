import { supabase } from './supabase';

// The signed-in user's own rating for one recipe -- null if they haven't
// rated it. Doesn't check subscription itself; callers (RecipeRating.tsx)
// must not even show an interactive control to a non-subscriber in the
// first place -- the real enforcement that only a subscriber can
// successfully write one lives in RLS (see
// 20260908070000_recipe_ratings.sql), not here.
export async function fetchMyRating(recipeId: string, userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('recipe_ratings')
    .select('rating')
    .eq('recipe_id', recipeId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.rating ?? null;
}

// Upsert -- one rating per person per recipe, so rating again just
// changes it (a typical star-rating UX) rather than creating a second
// row. Succeeds only for an active/trialing subscriber; RLS rejects
// anyone else regardless of what the client believes isSubscribed is.
export async function rateRecipe(recipeId: string, userId: string, rating: number): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('recipe_ratings')
    .upsert({ recipe_id: recipeId, user_id: userId, rating });
  if (error) return { error: error.message };
  return { error: null };
}
