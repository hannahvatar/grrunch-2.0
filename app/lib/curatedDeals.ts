import { supabase } from './supabase';

export interface Deal {
  id: string;
  chainName: string;
  itemName: string;
  category: string;
  price: number;
  originalPrice: number;
  discountPct: number;
  productUrl: string;
  imageUrl: string | null;
}

const UNCATEGORIZED = 'Other';

function mapRowToDeal(row: {
  id: string;
  chain_name: string;
  item_name: string;
  category: string | null;
  price: number;
  original_price: number;
  discount_pct: number;
  product_url: string;
  image_url: string | null;
}): Deal {
  return {
    id: row.id,
    chainName: row.chain_name,
    itemName: row.item_name,
    category: row.category ?? UNCATEGORIZED,
    price: row.price,
    originalPrice: row.original_price,
    discountPct: row.discount_pct,
    productUrl: row.product_url,
    imageUrl: row.image_url,
  };
}

export async function fetchAllDeals(): Promise<Deal[]> {
  const { data, error } = await supabase.from('curated_deals').select('*');
  if (error) throw error;
  return (data ?? []).map(mapRowToDeal);
}

export async function fetchDealsByIds(ids: string[]): Promise<Deal[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('curated_deals').select('*').in('id', ids);
  if (error) throw error;
  return (data ?? []).map(mapRowToDeal);
}

export function groupDealsByCategory(deals: Deal[]): Map<string, Deal[]> {
  const groups = new Map<string, Deal[]>();
  for (const deal of deals) {
    const existing = groups.get(deal.category);
    if (existing) {
      existing.push(deal);
    } else {
      groups.set(deal.category, [deal]);
    }
  }
  return groups;
}
