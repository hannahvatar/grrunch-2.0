import type { ImageSourcePropType } from 'react-native';

// Local recipe photos, keyed by exact recipe name. Recipes come from
// Supabase with no image_url column yet (see architecture notes on the
// Airtable-approval pipeline for recipe data) -- until that's added,
// photos the user drops into assets/ are wired in here by name so the
// Meals tab can show a real photo instead of the CakeIcon placeholder.
// Falls back to the placeholder for any recipe not listed.
const RECIPE_IMAGES: Record<string, ImageSourcePropType> = {
  // Cropped from the original upload to a wide card-banner framing that
  // keeps the kabobs (rather than mostly plate/rice) in frame at the
  // card's short aspect ratio -- see grilled-chicken-souvlaki-kabobs-with-lemon-rice.png
  // for the untouched original.
  'Grilled Chicken Souvlaki Kabobs with Lemon Rice': require('../assets/grilled-chicken-souvlaki-kabobs-with-lemon-rice-card.jpg'),
};

export function getRecipeImage(name: string): ImageSourcePropType | undefined {
  return RECIPE_IMAGES[name];
}
