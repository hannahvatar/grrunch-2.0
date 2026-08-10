import { supabase } from './supabase';
import type { DealTag, IngredientLine, Meal, OptionalAddition } from './mealData';
import { fetchProducePrices, fetchStaplePrices, fetchStatcanPrices, matchReferencePrice, type StaplePrice } from './staplePrices';
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
  quantity_estimated?: boolean;
}

function mapDealTag(tag: RecipeDealTagRow): DealTag {
  return {
    name: tag.name,
    discountPct: tag.discount_pct,
    price: tag.price,
    originalPrice: tag.original_price,
    store: tag.store,
    imageUrl: tag.image_url,
    quantityEstimated: tag.quantity_estimated,
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
    return {
      text, name: ingredient.name, dealTag, groceryText: text,
      quantity: ingredient.quantity, unit: ingredient.unit,
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
  staplePrices: StaplePrice[]
): Meal {
  const dealTags = ((row.deal_tags as RecipeDealTagRow[]) ?? []).map(mapDealTag);
  return {
    id: row.id,
    name: row.name,
    price: row.price ?? 0,
    minutes: row.minutes ?? 0,
    servings: row.servings ?? 1,
    dealTags,
    calories: row.calories ?? 0,
    protein: row.protein ?? 0,
    ingredients: (row.ingredients as RecipeIngredient[]).map((ingredient) =>
      mapIngredient(ingredient, dealTags, statcanPrices, producePrices, staplePrices)
    ),
    instructions: row.instructions as string[],
    optionalAdditions: (row.optional_additions as OptionalAddition[]) ?? [],
  };
}

export async function fetchAllRecipes(): Promise<Meal[]> {
  const [{ data, error }, statcanPrices, producePrices, staplePrices] = await Promise.all([
    supabase.from('recipes').select('*'),
    fetchStatcanPrices(),
    fetchProducePrices(),
    fetchStaplePrices(),
  ]);
  if (error) throw error;
  return (data ?? []).map((row) => mapRowToMeal(row, statcanPrices, producePrices, staplePrices));
}

export async function fetchRecipeById(id: string): Promise<Meal | null> {
  const [{ data, error }, statcanPrices, producePrices, staplePrices] = await Promise.all([
    supabase.from('recipes').select('*').eq('id', id).maybeSingle(),
    fetchStatcanPrices(),
    fetchProducePrices(),
    fetchStaplePrices(),
  ]);
  if (error) throw error;
  return data ? mapRowToMeal(data, statcanPrices, producePrices, staplePrices) : null;
}

export async function fetchRecipesByIds(ids: string[]): Promise<Meal[]> {
  if (ids.length === 0) return [];
  const [{ data, error }, statcanPrices, producePrices, staplePrices] = await Promise.all([
    supabase.from('recipes').select('*').in('id', ids),
    fetchStatcanPrices(),
    fetchProducePrices(),
    fetchStaplePrices(),
  ]);
  if (error) throw error;
  return (data ?? []).map((row) => mapRowToMeal(row, statcanPrices, producePrices, staplePrices));
}
