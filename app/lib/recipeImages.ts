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
  // Replaced with a new shot showing the Boursin package itself
  // (Anabelle's call) -- uncropped, already at ~1.7:1 (1344x784). The
  // old tighter-cropped plate-only version stays on disk
  // (boursin-me-up-chicken-mushroom-rice.png) but is no longer referenced.
  'Boursin-Me-Up Chicken & Mushroom Rice': require('../assets/boursin-me-up-chicken-mushroom-rice-w-pack.jpeg'),
  // Uploaded already close to the card's ~1.7:1 target (1344x784 vs the
  // card's 1402/824) -- no crop needed/applied, uncropped as uploaded.
  'Sizzling Pork Skewers': require('../assets/sizzling-pork-skewers.jpeg'),
  'Hot Dog Hash': require('../assets/hot-dog-hash.jpeg'),
  // Cropped tighter around the bowl (Anabelle's call: "emphasis the
  // plate but make sure sriracha is visible") -- original backed up
  // before cropping per the standing rule. 1266x744, matching the
  // card's ~1.7:1 target almost exactly.
  'Honey Garlic Chicken Noodle Toss': require('../assets/honey-garlic-chicken-noodles-toss.jpeg'),
  // Uploaded already close to the card's ~1.7:1 target (1344x784) --
  // no crop needed/applied, uncropped as uploaded.
  'Instant Noodles Forever — The Pork One': require('../assets/instant-noodles-forever-pork.jpeg'),
  // Cropped tighter from the left (Anabelle's call: "so we dont see as
  // much of the arms" -- the source shot is held up by two tattooed
  // arms) -- original backed up before cropping per the standing rule.
  // 1080x634, matching the card's ~1.7:1 target.
  'Kraft Dinner alla Carbonara': require('../assets/kraft-dinner-alla-carbonara.jpeg'),
};

export function getRecipeImage(name: string): ImageSourcePropType | undefined {
  return RECIPE_IMAGES[name];
}
