// Nearest-stores lookup — architecture.md sections 2.2 (Step 1 Setup) and 3.1
// (Backend API: store/location queries via Google Places API).
//
// Given a lat/lng, finds the nearest physical location of each of the 5 MVP
// chains and upserts them into `stores`, keyed by `google_place_id` so
// repeat calls (e.g. the user re-opening Setup) update the same rows instead
// of piling up duplicates.
//
// Client contract:
//   POST { lat: number, lng: number }
//   -> 200 { stores: StoreResult[] }  (0-5 entries — a chain with nothing
//      found nearby is simply omitted, not backfilled with a distant result)
//
// NOT implemented here: the "location declined -> coarse IP-based fallback"
// path from architecture.md. This function only handles turning a lat/lng
// into nearby stores; getting a lat/lng when the user declines precise
// location needs a separate IP-geolocation provider decision, which hasn't
// been made yet. Until that lands, callers without device location simply
// have no fallback path.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

// Minimal, function-local slice of the schema (just `stores`) so this
// function stays deployable on its own, without reaching into the Expo
// app's types/database.ts across the repo.
interface Database {
  // Required by supabase-js's schema inference (matches the shape
  // `supabase gen types typescript` emits) — without it, `.from(...)` calls
  // fall back to `never` instead of resolving against `public.Tables`.
  __InternalSupabase: { PostgrestVersion: string };
  public: {
    Tables: {
      stores: {
        Row: {
          id: string;
          chain_name: string;
          banner: string | null;
          address: string;
          lat: number | null;
          lng: number | null;
          hours: unknown | null;
          google_place_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          chain_name: string;
          banner?: string | null;
          address: string;
          lat?: number | null;
          lng?: number | null;
          hours?: unknown | null;
          google_place_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["stores"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

const GOOGLE_PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY");
const SEARCH_RADIUS_METERS = 25_000;

interface ChainConfig {
  chainName: string;
  // Multiple queries let one MVP "chain" slot cover interchangeable banners
  // that should count as the same tracked store. Real Canadian Superstore
  // and No Frills are both Loblaws banners but have separate storefronts,
  // separate flyers, and separate pricing — tracked as two distinct chains,
  // not merged into one slot.
  queries: string[];
}

const MVP_CHAINS: ChainConfig[] = [
  { chainName: "Save-On-Foods", queries: ["Save-On-Foods"] },
  { chainName: "Real Canadian Superstore", queries: ["Real Canadian Superstore"] },
  { chainName: "No Frills", queries: ["No Frills"] },
  { chainName: "Safeway", queries: ["Safeway"] },
  { chainName: "T&T Supermarket", queries: ["T&T Supermarket"] },
  { chainName: "Walmart", queries: ["Walmart"] },
];

interface GooglePlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  regularOpeningHours?: unknown;
}

interface StoreResult {
  chain_name: string;
  banner: string | null;
  address: string;
  lat: number;
  lng: number;
  hours: unknown;
  google_place_id: string;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function searchPlaces(query: string, lat: number, lng: number): Promise<GooglePlace[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY ?? "",
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.regularOpeningHours",
    },
    body: JSON.stringify({
      textQuery: query,
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: SEARCH_RADIUS_METERS,
        },
      },
      maxResultCount: 5,
    }),
  });

  if (!res.ok) {
    throw new Error(`Places API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { places?: GooglePlace[] };
  return data.places ?? [];
}

async function findNearestForChain(
  chain: ChainConfig,
  lat: number,
  lng: number
): Promise<StoreResult | null> {
  const candidateLists = await Promise.all(
    chain.queries.map((query) => searchPlaces(query, lat, lng))
  );
  const candidates = candidateLists.flat().filter((place) => place.location);

  if (candidates.length === 0) return null;

  const nearest = candidates.reduce((closest, place) => {
    const distance = haversineMeters(lat, lng, place.location!.latitude, place.location!.longitude);
    const closestDistance = haversineMeters(
      lat,
      lng,
      closest.location!.latitude,
      closest.location!.longitude
    );
    return distance < closestDistance ? place : closest;
  });

  return {
    chain_name: chain.chainName,
    banner: nearest.displayName?.text ?? null,
    address: nearest.formattedAddress ?? "",
    lat: nearest.location!.latitude,
    lng: nearest.location!.longitude,
    hours: nearest.regularOpeningHours ?? null,
    google_place_id: nearest.id,
  };
}

export default {
  fetch: withSupabase<Database>({ auth: ["publishable"] }, async (req, ctx) => {
    if (!GOOGLE_PLACES_API_KEY) {
      return Response.json(
        { error: "GOOGLE_PLACES_API_KEY is not configured on this Supabase project." },
        { status: 500 }
      );
    }

    const { lat, lng } = await req.json();
    if (typeof lat !== "number" || typeof lng !== "number") {
      return Response.json({ error: "Request body must include numeric lat and lng." }, { status: 400 });
    }

    const results = await Promise.all(
      MVP_CHAINS.map((chain) => findNearestForChain(chain, lat, lng))
    );
    const found = results.filter((result): result is StoreResult => result !== null);

    // ctx.supabaseAdmin bypasses RLS — needed since `stores` only grants
    // public SELECT, not INSERT/UPDATE (see the RLS policies in
    // supabase/migrations/20260725163230_init_schema.sql).
    const { data: stores, error } = await ctx.supabaseAdmin
      .from("stores")
      .upsert(found, { onConflict: "google_place_id" })
      .select();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ stores });
  }),
};

/* To invoke locally:

  1. Run `supabase start` then `supabase secrets set --env-file .env.local GOOGLE_PLACES_API_KEY=...`
     (or export it before `supabase functions serve`)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/nearest-stores' \
    --header 'apiKey: <anon key>' \
    --header 'Content-Type: application/json' \
    --data '{"lat":49.2827,"lng":-123.1207}'

*/
