export interface DealTag {
  name: string;
  discountPct: number;
  price?: number;
  originalPrice?: number;
  store?: string;
  imageUrl?: string;
  // The store's weekly flyer link (curated_deals.product_url, same
  // field app/(tabs)/best-deals.tsx already links out to) -- lets the
  // recipe page offer a "See in flyer" link per deal-tagged ingredient.
  // Empty for produce-gap-sourced deals (see resolve_produce_gaps() in
  // scripts/sync_weekly_deals.py, which has no real flyer link to give)
  // -- never shown as a link when empty, rather than guessing one.
  productUrl?: string;
  // True when the deal's package size was our best assumption (Airtable
  // "Estimated quantity") rather than stated on the flyer itself -- lets
  // the grocery list flag that the quantity shown is a guess, not a fact.
  quantityEstimated?: boolean;
  // 'flyer' means originalPrice is a real price the store printed;
  // 'reference' means it's a StatCan/human-researched comparison price
  // WE derived, never printed on any flyer -- see
  // lib/curatedDeals.ts's isReferencePriced()/showsRealDiscount(), which
  // every render site uses instead of checking this directly.
  originalPriceSource?: 'flyer' | 'reference';
  // True only when `price` was computed by scaling a per-lb/kg/100g
  // rate against a GUESSED package weight (package_weight_g_source=
  // 'estimated' -- see compute_deal_tag_pricing()), not a labeled or
  // measured one. Distinct from quantityEstimated: this is about
  // whether the dollar figure itself rests on a real physical weight,
  // not about how much you'll need to buy.
  priceEstimated?: boolean;
  // True when this deal has been explicitly opted into proportional
  // (weight-fragmented) pricing -- see curated_deals.fragment_by_weight
  // and compute_deal_tag_pricing()'s own migration comment. Lets the
  // client show a real "use exactly this much" quantity instead of the
  // generic "buy 1 whole package" text (see IngredientLine.useQuantityText)
  // only for the deals where that's actually true.
  fragmentByWeight?: boolean;
  // The deal's real known package weight in grams (curated_deals.
  // package_weight_g), or undefined when genuinely unknown/bulk. Lets
  // describeDealPackage() redo the same avg-weight-bridge package-count
  // math server-side pricing already does (see compute_deal_tag_pricing),
  // so an each-count ingredient (e.g. "4 Pogo pups" from a 20-pack) can
  // show the real "1 package" instead of misreading the raw count as a
  // package multiplier.
  packageWeightG?: number;
}

// An ingredient line, with the matching deal tag attached when that
// ingredient was sourced from a real flyer deal -- lets the grocery list
// show the deal's image/store next to the item it actually came from.
// estimatedPrice is set instead, client-side, when the ingredient isn't
// on any deal but matches a generic staple (see lib/staplePrices.ts) --
// never both at once, and never invented when neither applies.
export interface IngredientLine {
  text: string;
  // The raw ingredient name (no quantity/unit) -- kept alongside the
  // flattened display text so the grocery list can match it against this
  // week's deals for store attribution even when it isn't deal-tagged
  // (see lib/curatedDeals.ts matchItemStore).
  name: string;
  dealTag?: DealTag;
  estimatedPrice?: { avgPrice: number; unit: string; source: 'statcan' | 'produce' | 'staple' };
  // Grocery-list-only override of `text`, for staples the recipe states
  // in cooked terms (e.g. "2 cups Rice") but that you actually buy dry
  // (e.g. "⅔ cup (123 g) dry Rice") -- see lib/unitConversion.ts
  // describeDryEquivalent. The recipe page keeps showing `text` (the
  // cooked amount the dish/instructions actually use) unchanged.
  groceryText?: string;
  // The raw recipe quantity/unit `text`/`groceryText` were built from --
  // kept alongside the flattened display strings so a batch multiplier
  // (recipe page's servings stepper, Grocery list's "make Nx") can
  // re-derive them at a scaled quantity (see lib/mealScaling.ts
  // scaleIngredientDisplay) without re-running staple price matching.
  quantity: string;
  unit: string;
  // Only set for a dealTag.fragmentByWeight ingredient -- e.g. "Use
  // 217 g". `text` still shows the generic "1 package X" (you're still
  // buying a whole package off the shelf, deal price never fragments --
  // see describeDealPackage), but that alone no longer tells you how
  // much of it THIS recipe actually needs, now that the badge price
  // doesn't reflect a partial-package cost either. Rendered as a small
  // annotation under the deal card. Anabelle, after the badge/
  // contribution split: "users now dont know what quantity to use."
  useQuantityText?: string;
}

// A serving suggestion shown at the bottom of the recipe page -- e.g.
// "Roasted Lemon Asparagus" alongside a creamy mushroom chicken skillet.
// Deliberately not an IngredientLine: no quantity, no price, no deal
// tag, no nutrition contribution -- just a title and a short paragraph
// of how to make it. Never appears in `ingredients` (which is what
// refresh_recipe_deal_tags/refresh_recipe_nutrition actually cost and
// count), so it can never accidentally get priced or nutrition-counted.
export interface OptionalAddition {
  title: string;
  description: string;
}

// A standalone prep technique linked from one of this recipe's own
// ingredients (e.g. "Pork belly" links to a basic crispy pork belly
// method) -- rendered as its own section at the bottom of the recipe
// page, with the matching ingredient in "What you'll need" acting as a
// jump link to it. Lives in a shared `sub_recipes` table (see
// lib/subRecipes.ts), matched by ingredient name -- authored once,
// reusable by any future recipe naming a matching ingredient, same
// name-matching philosophy as every other reference table in this app.
// Purely informational: `ingredients` here are plain strings, never
// priced/matched against anything, completely separate from the main
// recipe's own priced `ingredients` array above.
export interface SubRecipe {
  title: string;
  matchIngredientName: string;
  description: string;
  ingredients: string[];
  instructions: string[];
  // Optional direct attachment to exactly one recipe (sub_recipes.
  // recipe_id) -- shown on that recipe's page regardless of any
  // ingredient-name or Optional-text match. undefined (the common
  // case) keeps the original text-matching behavior, for a reusable
  // technique like "Basic Crispy Pork Belly" meant to auto-attach to
  // any recipe naming the matching ingredient, not just one.
  recipeId?: string;
}

// Meal shape shared by the recipes data layer (lib/recipes.ts) and the
// screens that render it (Meals tab, recipe.tsx, Profile's saved recipes).
export interface Meal {
  id: string;
  name: string;
  price: number;
  minutes: number;
  servings: number;
  dealTags: DealTag[];
  calories: number;
  protein: number;
  ingredients: IngredientLine[];
  instructions: string[];
  optionalAdditions: OptionalAddition[];
  // Only the sub-recipes actually relevant to THIS meal's own
  // ingredients (cross-referenced by name in lib/recipes.ts) -- not
  // every sub-recipe in the shared table.
  subRecipes: SubRecipe[];
}
