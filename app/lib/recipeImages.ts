import type { ImageSourcePropType } from 'react-native';

// Local recipe photos, keyed by exact recipe name. Recipes come from
// Supabase with no image_url column yet (see architecture notes on the
// Airtable-approval pipeline for recipe data) -- until that's added,
// photos the user drops into assets/ are wired in here by name so the
// Meals tab can show a real photo instead of the CakeIcon placeholder.
// Falls back to the placeholder for any recipe not listed.
const RECIPE_IMAGES: Record<string, ImageSourcePropType> = {
  // Uploaded as-is, uncropped (Anabelle's explicit call after an
  // earlier crop of this same photo got overwritten over her original
  // upload with no backup kept -- won't repeat that mistake) -- was
  // the recipe's OLD name/photo (kabobs-only shot, key "Grilled
  // Chicken Souvlaki Kabobs with Lemon Rice") before being renamed to
  // "Souvlaki Street Bowl" and reshot as a full bowl. The old kabobs
  // assets stay on disk (grilled-chicken-souvlaki-kabobs-with-lemon-rice*)
  // but are no longer referenced anywhere.
  'Souvlaki Street Bowl with a Kick': require('../assets/souvlaki-street-bowl.jpeg'),
  // Uploaded already at ~1.7:1, matching the card's own aspectRatio
  // (1402/824 -- see MealCard.tsx) almost exactly -- cropped tighter
  // around the bowl itself per the same preference as above.
  'Boursin-Me-Up Chicken & Mushroom Rice': require('../assets/boursin-me-up-chicken-mushroom-rice.png'),
};

export function getRecipeImage(name: string): ImageSourcePropType | undefined {
  return RECIPE_IMAGES[name];
}
