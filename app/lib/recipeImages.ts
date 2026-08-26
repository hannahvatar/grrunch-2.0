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
  // Replaced with a "-rev" shot Anabelle provided -- no arms at all
  // this time (the earlier version needed an arm-crop; this one sidesteps
  // it entirely), also shows the Kraft Dinner box + seasoning packet.
  // Uncropped, already at ~1.7:1 (1344x784).
  'Kraft Dinner alla Carbonara': require('../assets/kraft-dinner-alla-carbonara.jpeg'),
  // Uploaded already close to the card's ~1.7:1 target (1344x784) --
  // no crop needed/applied, uncropped as uploaded.
  'Napolitan (Japanese Ketchup Spaghetti) ナポリタン': require('../assets/napolitan-japanese-ketchup-spaghetti.jpeg'),
  // Uploaded already close to the card's ~1.7:1 target (1344x784) --
  // no crop needed/applied, uncropped as uploaded.
  'Breakfast for Dinner — Froot Loops French Toasts': require('../assets/breakfast-for-dinner-froot-loops-french-toasts.jpeg'),
  // Cropped 20% in, leaning toward the right side (Anabelle's call) --
  // keeps the fork/napkin and the plate's three dipping sauces fully
  // in frame while trimming the drinks column on the left. Original
  // backed up before cropping per the standing rule. 1075x627,
  // matching the card's ~1.7:1 target.
  'BBQ Ribs ’n’ Cauli Nuggets': require('../assets/bbq-ribs-n-cauli-nuggets.jpeg'),
  // Uploaded already close to the card's ~1.7:1 target (1344x784) --
  // no crop needed/applied, uncropped as uploaded.
  'Crack a Tin — Sardine Spaghetti': require('../assets/crack-a-tin-sardine-spaghetti.jpeg'),
  // Uploaded already close to the card's ~1.7:1 target (1344x784) --
  // no crop needed/applied, uncropped as uploaded.
  'Smoking Hot Sweet Potato & Kale Skillet': require('../assets/smoking-hot-sweet-potato-kale-skillet.jpeg'),
  // Uploaded already close to the card's ~1.7:1 target (1344x784) --
  // no crop needed/applied, uncropped as uploaded.
  'TikTok Baked Feta Pasta (with a tofu twist)': require('../assets/tiktok-baked-feta-pasta-tofu.jpeg'),
  // Uploaded already close to the card's ~1.7:1 target (1344x784) --
  // no crop needed/applied, uncropped as uploaded.
  'Fast Food Fakeout — Big Mac Combo': require('../assets/fast-food-fakeout-big-mac-combo.jpeg'),
  // Uploaded already close to the card's ~1.7:1 target (1344x784) --
  // no crop needed/applied, uncropped as uploaded.
  'Fry Me a Sandwich': require('../assets/french-fries-sandwich.jpeg'),
  // Uploaded already close to the card's ~1.7:1 target (1344x784) --
  // no crop needed/applied, uncropped as uploaded.
  'Eggplant Got Beef': require('../assets/eggplant-got-beef.jpeg'),
  // Uploaded already close to the card's ~1.7:1 target (1376x768) --
  // no crop needed/applied, uncropped as uploaded.
  'Pizza Party Pasta': require('../assets/pizza-party-pastas.jpeg'),
  // Cropped 20% in, centered (Anabelle's call) -- original backed up
  // before cropping per the standing rule (kielbasa-gone-krauty-original.jpeg).
  // 1075x627, matching the card's ~1.7:1 target.
  'Kielbasa Gone Krauty': require('../assets/kielbasa-gone-krauty.jpeg'),
  // Zoomed all the way back out to the original upload, uncropped
  // (Anabelle's call, after two rounds of tighter cropping). 1344x784,
  // slightly wider than the card's ~1.7:1 target but no longer trimmed.
  'K-Pogo (TikTok Korean Corn Dog)': require('../assets/k-pogo.jpeg'),
  // Uploaded already close to the card's ~1.7:1 target (1344x784) --
  // no crop needed/applied, uncropped as uploaded.
  'Pizza à la Caesar': require('../assets/pizza-ceasar.jpeg'),
  // Uploaded already close to the card's ~1.7:1 target (1344x784) --
  // no crop needed/applied, uncropped as uploaded.
  'Jamaican Patty with Mango Salsa & Caramelized Plantain': require('../assets/jamaican-patties-plantain-mangos.jpeg'),
  // Uploaded already close to the card's ~1.7:1 target (1344x784) --
  // no crop needed/applied, uncropped as uploaded.
  'Vermicelli Gets a Spring Roll': require('../assets/vermicelli-gets-spring-roll.jpeg'),
  // Cropped 10% in, centered (Anabelle's call) -- original backed up
  // before cropping per the standing rule
  // (bean-there-corn-that-original.jpeg). 1210x706, matching the
  // card's ~1.7:1 target.
  'Chicken, Beans & Corny Things': require('../assets/bean-there-corn-that.jpeg'),
  // Uploaded already close to the card's ~1.7:1 target (1344x784) --
  // no crop needed/applied, uncropped as uploaded.
  'Berry Good Watermelon Salad': require('../assets/berry-good-watermelon-salad.jpeg'),
  // Uploaded already close to the card's ~1.7:1 target (1344x784) --
  // no crop needed/applied, uncropped as uploaded.
  'Kraft Singles Mac ’n’ Mingle': require('../assets/kraft-singles-mac-n-mingle.jpeg'),
  // Uploaded already close to the card's ~1.7:1 target (1344x784) --
  // no crop needed/applied, uncropped as uploaded.
  'The Great Pepper Roast': require('../assets/great-pepper-roast.jpeg'),
  // Uploaded already close to the card's ~1.7:1 target (1344x784) --
  // no crop needed/applied, uncropped as uploaded.
  'Cold Cuts, Hot Pizza': require('../assets/cold-cuts-hot-pizza.jpeg'),
  // Uploaded already close to the card's ~1.7:1 target (1344x784) --
  // no crop needed/applied, uncropped as uploaded.
  'Wok This Way Hoisin Pork': require('../assets/wok-this-way-hoisin-pork.jpeg'),
  // Replaced with a "-rev" shot Anabelle provided -- pre-emptively
  // re-encoded via `sips -s format jpeg` before wiring in (standing
  // precaution since the Eggy Croissant photo outages -- a raw upload
  // can look byte-valid by every file-signature check and still crash
  // Metro's bundler). Already at the card's ~1.7:1 target (1344x784),
  // no crop needed. Old unsuffixed original stays on disk
  // (curry-up-coconut-chicken.jpeg) but is no longer referenced.
  'Curry Up Coconut Chicken': require('../assets/curry-up-coconut-chicken-rev-fixed.jpeg'),
  // Replaced with a "-rev3" shot Anabelle provided -- pre-emptively
  // re-encoded via `sips -s format jpeg` before wiring in (the "-rev2"
  // upload looked identical by every file-signature check yet still
  // crashed Metro's bundler -- `file`/sips alone can't be trusted to
  // catch this, so re-encoding first is now the standing precaution for
  // every new photo, not just ones already known to be broken). Already
  // at the card's ~1.7:1 target (1344x784), no crop needed.
  'Breakfast for Dinner — Eggy Croissant': require('../assets/breakfast-for-dinner-eggy-croissant-rev3-fixed.jpeg'),
  // Pre-emptively re-encoded via `sips -s format jpeg` before wiring in,
  // same standing precaution as every photo since the Eggy Croissant
  // outages. Already at the card's ~1.7:1 target (1344x784), no crop
  // needed. Key renamed from "Sticky Fingers Chicken" -- the recipe's
  // old name -- to match the current title; the lookup is by exact
  // name, so the rename alone silently dropped the photo to the
  // placeholder until this key caught up.
  'Honey, I Glazed the Chicken': require('../assets/sticky-fingers-chicken-fixed.jpeg'),
  // Pre-emptively re-encoded via `sips -s format jpeg` before wiring in,
  // same standing precaution as every photo since the Eggy Croissant
  // outages. Already at the card's ~1.7:1 target (1344x784), no crop
  // needed.
  "Curry Up, It's Vegan!": require('../assets/curry-up-its-vegan-fixed.jpeg'),
  // Pre-emptively re-encoded via `sips -s format jpeg` before wiring in,
  // same standing precaution as every photo since the Eggy Croissant
  // outages. Already at the card's ~1.7:1 target (1344x784), no crop
  // needed.
  'Sunday Roast With the Most': require('../assets/sunday-roast-with-the-most-fixed.jpeg'),
  // Pre-emptively re-encoded via `sips -s format jpeg` before wiring in,
  // same standing precaution as every photo since the Eggy Croissant
  // outages. Already at the card's ~1.7:1 target (1344x784), no crop
  // needed.
  'Salmon Says Fettuccine': require('../assets/salmon-says-fettuccine-fixed.jpeg'),
  // Pre-emptively re-encoded via `sips -s format jpeg` before wiring in,
  // same standing precaution as every photo since the Eggy Croissant
  // outages. Already at the card's ~1.7:1 target (1344x784), no crop
  // needed.
  'Fish Sticks & Chill': require('../assets/fish-sticks-and-chill-fixed.jpeg'),
  // Pre-emptively re-encoded via `sips -s format jpeg` before wiring in,
  // same standing precaution as every photo since the Eggy Croissant
  // outages. Already at the card's ~1.7:1 target (1344x784), no crop
  // needed.
  'Basic, But Make It Lasagna': require('../assets/basic-but-make-it-lasagna-fixed.jpeg'),
  // Pre-emptively re-encoded via `sips -s format jpeg` before wiring in,
  // same standing precaution as every photo since the Eggy Croissant
  // outages. Already at the card's ~1.7:1 target (1344x784), no crop
  // needed.
  'Taco Tuesday, Every Day': require('../assets/taco-tuesday-every-day-fixed.jpeg'),
  // Pre-emptively re-encoded via `sips -s format jpeg` before wiring in,
  // same standing precaution as every photo since the Eggy Croissant
  // outages. Already at the card's ~1.7:1 target (1344x784), no crop
  // needed. Filename corrected from the uploaded original's typo
  // ("potatoe-bacon0cheese-repeat") -- the require() key is what
  // matters for matching, but no reason to carry the typo into a new
  // file on disk.
  'Potato, Bacon, Cheese, Repeat': require('../assets/potato-bacon-cheese-repeat-fixed.jpeg'),
  // Pre-emptively re-encoded via `sips -s format jpeg` before wiring in,
  // same standing precaution as every photo since the Eggy Croissant
  // outages. Already at the card's ~1.7:1 target (1344x784), no crop
  // needed. Found sitting unwired in assets/ during PR cleanup.
  'Cheesy Whizzy Spaghetti': require('../assets/cheesy-whizzy-spaghetti-fixed.jpeg'),
};

export function getRecipeImage(name: string): ImageSourcePropType | undefined {
  return RECIPE_IMAGES[name];
}
