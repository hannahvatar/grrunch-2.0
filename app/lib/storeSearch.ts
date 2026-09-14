import { supabase } from './supabase';

// Mirrors search-stores/index.ts's StoreSearchResult exactly (see that
// function's own header comment for the client contract).
export interface StoreSearchResult {
  id: string;
  chainName: string;
  banner: string | null;
  address: string;
  cityLabel: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  openNow: boolean | null;
  hoursText: string | null;
  mapsUrl: string;
}

interface SearchStoresParams {
  chainName: string;
  lat?: number;
  lng?: number;
  city?: string;
  limit?: number;
}

// Thin wrapper around the search-stores Edge Function, for the "Select a
// Store" picker (components/StoreSelectorModal.tsx). Throws on a non-2xx
// response with the real server-side error message unwrapped -- same
// gotcha/pattern as dev-deals.tsx's submit() and dev-recipes.tsx's
// handleToggleFeatured: supabase-js only populates `data` for a genuine
// 2xx, so a validation/upstream error's message has to be read off
// invokeError's raw Response instead.
export async function searchStoresByChain(params: SearchStoresParams): Promise<StoreSearchResult[]> {
  const { data, error: invokeError } = await supabase.functions.invoke<{
    stores?: StoreSearchResult[];
    error?: string;
  }>('search-stores', {
    body: {
      chain_name: params.chainName,
      lat: params.lat,
      lng: params.lng,
      city: params.city,
      limit: params.limit,
    },
  });

  if (invokeError || !data?.stores) {
    let message = data?.error ?? invokeError?.message ?? 'Could not load stores.';
    const context = (invokeError as { context?: Response } | undefined)?.context;
    if (context && typeof context.json === 'function') {
      try {
        const body = (await context.json()) as { error?: string };
        if (body?.error) message = body.error;
      } catch {
        // Body wasn't JSON (or already consumed) -- keep the fallback above.
      }
    }
    throw new Error(message);
  }

  return data.stores;
}
