import { supabase } from './supabase';
import type { DealTag, IngredientLine, Meal, OptionalAddition, SubRecipe } from './mealData';
import { fetchProducePrices, fetchStaplePrices, fetchStatcanPrices, matchReferencePrice, type StaplePrice } from './staplePrices';
import { fetchSubRecipes } from './subRecipes';
import { describeDealPackage, describeQuantityText } from './unitConversion';

interface RecipeIngredient {
  name: string;
  quantity: string;
  unit: string;
}

interface RecipeDealTagRow {
  name: string;
  discount_pct: number;
  price?: number;
  original_price?: number;
  store?: string;
  image_url?: string;
  product_url?: string;
  quantity_estimated?: boolean;
  original_price_source?: string;
  price_estimated?: boolean;
  fragment_by_weight?: boolean;
}

function mapDealTag(tag: RecipeDealTagRow): DealTag {
  return {
    name: tag.name,
    discountPct: tag.discount_pct,
    price: tag.price,
    originalPrice: tag.original_price,
    store: tag.store,
    imageUrl: tag.image_url,
    // "" for produce-gap-sourced deals (no real flyer link to give) --
    // normalized to undefined so callers can check truthiness directly
    // instead of also handling an empty-but-present string.
    productUrl: tag.product_url || undefined,
    quantityEstimated: tag.quantity_estimated,
    originalPriceSource: tag.original_price_source as 'flyer' | 'reference' | undefined,
    priceEstimated: tag.price_estimated,
    fragmentByWeight: tag.fragment_by_weight,
  };
}

// Ingredients are stored structured ({name, quantity, unit}) so a future
// Grocery List Generator can consolidate across meals -- flattened to a
// display string here, with the matching deal tag (by ingredient name)
// attached when that ingredient was sourced from a real flyer deal, so the
// grocery list can show its image/store next to the item. When there's no
// deal, falls back to a generic staple price estimate if one matches --
// never both, and never a guess when neither applies.
function mapIngredient(
  ingredient: RecipeIngredient,
  dealTags: DealTag[],
  statcanPrices: StaplePrice[],
  producePrices: StaplePrice[],
  staplePrices: StaplePrice[]
): IngredientLine {
  const dealTag = dealTags.find((tag) => tag.name === ingredient.name);
  // A deal-tagged ingredient's stated quantity/unit can be a fraction of
  // the actual package (see describeDealPackage) -- we never fragment
  // deal items, so display always shows the whole package bought, even
  // though the recipe's real quantity (unchanged below) is what drives
  // nutrition scaling server-side. Checked before dryEquivalent/
  // unitCount since those describe non-deal staple quantities.
  const dealPackage = dealTag ? describeDealPackage(ingredient.quantity, ingredient.unit) : undefined;
  if (dealPackage) {
    const text = `${dealPackage} ${ingredient.name}`;
    // Only a deal explicitly opted into fragmentation (see
    // DealTag.fragmentByWeight) has a price that actually reflects
    // less than the whole package -- for every other deal, "1 package"
    // above is already the complete, honest instruction (buy and use
    // the whole thing), and stating a bare gram number alongside it
    // would wrongly imply you could buy less.
    const useQuantityText = dealTag?.fragmentByWeight
      ? `Use ${ingredient.quantity} ${ingredient.unit}`.trim()
      : undefined;
    return {
      text, name: ingredient.name, dealTag, groceryText: text,
      quantity: ingredient.quantity, unit: ingredient.unit, useQuantityText,
    };
  }
  const { text, groceryText } = describeQuantityText(ingredient.name, ingredient.quantity, ingredient.unit);
  if (dealTag) {
    return {
      text, name: ingredient.name, dealTag, groceryText,
      quantity: ingredient.quantity, unit: ingredient.unit,
    };
  }
  const match = matchReferencePrice(
    ingredient.name, ingredient.quantity, ingredient.unit,
    statcanPrices, producePrices, staplePrices
  );
  return {
    text,
    name: ingredient.name,
    estimatedPrice: match ? { avgPrice: match.avgPrice, unit: match.unit, source: match.source } : undefined,
    groceryText,
    quantity: ingredient.quantity,
    unit: ingredient.unit,
  };
}

// Keeps every deal-tagged ingredient together as one contiguous group
// (in their authored relative order), ahead of the non-deal staples (in
// theirs) -- a recipe authored with a staple in between two deal items
// (e.g. "Longanisa, Marinated Eggs, Rice, Green Onions") otherwise reads
// as if Rice were also on sale, or splits the "what's actually
// discounted" items apart for no reason. A produce deal (e.g. Green
// Onions) is exactly as much a deal item as a packaged one (e.g.
// Marinated Eggs) here -- both simply have a dealTag, so both group
// together regardless of what kind of deal tagged them.
function groupDealItemsTogether(ingredients: IngredientLine[]): IngredientLine[] {
  const dealItems = ingredients.filter((ingredient) => ingredient.dealTag);
  const staples = ingredients.filter((ingredient) => !ingredient.dealTag);
  return [...dealItems, ...staples];
}

function mapRowToMeal(
  row: {
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
    optional_additions: unknown;
  },
  statcanPrices: StaplePrice[],
  producePrices: StaplePrice[],
  staplePrices: StaplePrice[],
  subRecipes: SubRecipe[]
): Meal {
  const dealTags = ((row.deal_tags as RecipeDealTagRow[]) ?? []).map(mapDealTag);
  const ingredientNames = new Set(
    (row.ingredients as RecipeIngredient[]).map((ingredient) => ingredient.name.toLowerCase())
  );
  return {
    id: row.id,
    name: row.name,
    price: row.price ?? 0,
    minutes: row.minutes ?? 0,
    servings: row.servings ?? 1,
    dealTags,
    calories: row.calories ?? 0,
    protein: row.protein ?? 0,
    ingredients: groupDealItemsTogether(
      (row.ingredients as RecipeIngredient[]).map((ingredient) =>
        mapIngredient(ingredient, dealTags, statcanPrices, producePrices, staplePrices)
      )
    ),
    instructions: row.instructions as string[],
    optionalAdditions: (row.optional_additions as OptionalAddition[]) ?? [],
    // Only the sub-recipes this meal's own ingredients actually name --
    // see lib/subRecipes.ts, matched by ingredient name against the
    // shared table, not embedded per-recipe.
    subRecipes: subRecipes.filter((sr) => ingredientNames.has(sr.matchIngredientName.toLowerCase())),
  };
}

export async function fetchAllRecipes(): Promise<Meal[]> {
  const [{ data, error }, statcanPrices, producePrices, staplePrices, subRecipes] = await Promise.all([
    supabase.from('recipes').select('*'),
    fetchStatcanPrices(),
    fetchProducePrices(),
    fetchStaplePrices(),
    fetchSubRecipes(),
  ]);
  if (error) throw error;
  return (data ?? []).map((row) => mapRowToMeal(row, statcanPrices, producePrices, staplePrices, subRecipes));
}

export async function fetchRecipeById(id: string): Promise<Meal | null> {
  const [{ data, error }, statcanPrices, producePrices, staplePrices, subRecipes] = await Promise.all([
    supabase.from('recipes').select('*').eq('id', id).maybeSingle(),
    fetchStatcanPrices(),
    fetchProducePrices(),
    fetchStaplePrices(),
    fetchSubRecipes(),
  ]);
  if (error) throw error;
  return data ? mapRowToMeal(data, statcanPrices, producePrices, staplePrices, subRecipes) : null;
}

export async function fetchRecipesByIds(ids: string[]): Promise<Meal[]> {
  if (ids.length === 0) return [];
  const [{ data, error }, statcanPrices, producePrices, staplePrices, subRecipes] = await Promise.all([
    supabase.from('recipes').select('*').in('id', ids),
    fetchStatcanPrices(),
    fetchProducePrices(),
    fetchStaplePrices(),
    fetchSubRecipes(),
  ]);
  if (error) throw error;
  return (data ?? []).map((row) => mapRowToMeal(row, statcanPrices, producePrices, staplePrices, subRecipes));
}
