// Nearest-stores lookup — architecture.md sections 2.2 (Step 1 Setup) and 3.1
// (Backend API: store/location queries via Google Places API).
//
// Given a lat/lng, finds the nearest physical location of each of the 5 MVP
// chains and upserts them into `stores`, keyed by `google_place_id` so
// repeat calls (e.g. the user re-opening Setup) update the same rows instead
// of piling up duplicates.
//
// Client contract:
//   POST { lat?: number, lng?: number }
//   -> 200 { stores: StoreResult[], precise: boolean }
//      (stores: 0-5 entries — a chain with nothing found nearby is simply
//      omitted, not backfilled with a distant result. precise: true when
//      lat/lng came from the caller; false when this function had to fall
//      back to coarse IP geolocation instead.)
//
// Implements the "location declined -> coarse IP-based fallback" path from
// architecture.md (2026-08-26, Anabelle: "yes lets tackle this now") --
// when lat/lng are omitted (the manual/skip path from app/location.tsx),
// resolves a city-level lat/lng from the caller's own request IP via
// ip-api.com (no API key, ~45 req/min per source IP -- more than enough for
// this MVP's traffic; see resolveCoarseLocation below for the exact
// provider call). If even THAT fails (no usable client IP -- e.g. local
// dev, or ip-api.com itself down), returns an empty stores array rather
// than guessing/mock data, same "honest empty state" principle
// app/stores.tsx's no-location screen already follows.

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

// T&T Supermarket dropped (Anabelle, 2026-08-27: "we are no longer doing
// T&T") -- matches EXCLUDED_CHAINS in scripts/sync_weekly_deals.py, which
// already excludes it from the weekly deals sync. Reversible the same way
// that one is documented as reversible: just add the chain back here.
const MVP_CHAINS: ChainConfig[] = [
  { chainName: "Save-On-Foods", queries: ["Save-On-Foods"] },
  { chainName: "Real Canadian Superstore", queries: ["Real Canadian Superstore"] },
  { chainName: "No Frills", queries: ["No Frills"] },
  { chainName: "Safeway", queries: ["Safeway"] },
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

interface IpApiResponse {
  status: "success" | "fail";
  message?: string;
  lat?: number;
  lon?: number;
  city?: string;
}

// Extracts the caller's real IP from the standard proxy header Supabase's
// edge runtime populates. x-forwarded-for can carry a comma-separated
// chain (client, proxy1, proxy2, ...) if the request passed through more
// than one hop -- the first entry is the original client.
function clientIpFrom(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip");
}

// Coarse, city-level fallback for the "location declined" path -- no API
// key, no signup (ip-api.com, free tier: ~45 req/min per source IP, HTTP
// only, well past enough for this MVP's traffic). Returns null (not a
// guess) for anything that isn't a resolvable public IP -- notably local
// dev, where the caller's address is loopback/private and ip-api.com will
// correctly refuse it rather than returning a wrong location.
async function resolveCoarseLocation(ip: string | null): Promise<{ lat: number; lng: number } | null> {
  if (!ip) return null;
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,lat,lon,city`);
    if (!res.ok) return null;
    const data = (await res.json()) as IpApiResponse;
    if (data.status !== "success" || typeof data.lat !== "number" || typeof data.lon !== "number") {
      return null;
    }
    return { lat: data.lat, lng: data.lon };
  } catch {
    return null;
  }
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

    // Tolerate a missing/empty body -- the manual/skip path from
    // app/location.tsx sends no lat/lng at all, which is the intended
    // trigger for the coarse IP fallback below, not a malformed request.
    let body: { lat?: unknown; lng?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      // no body sent -- fall through to the IP-based path
    }

    let lat = typeof body.lat === "number" ? body.lat : null;
    let lng = typeof body.lng === "number" ? body.lng : null;
    const precise = lat !== null && lng !== null;

    if (!precise) {
      const coarse = await resolveCoarseLocation(clientIpFrom(req));
      if (!coarse) {
        // No precise coords AND IP geolocation couldn't resolve anything
        // (local dev, unresolvable IP, provider down) -- honest empty
        // result rather than a guess. app/stores.tsx shows its real
        // "No location yet" state on this, same as before this fallback
        // existed.
        return Response.json({ stores: [], precise: false });
      }
      lat = coarse.lat;
      lng = coarse.lng;
    }

    const results = await Promise.all(
      MVP_CHAINS.map((chain) => findNearestForChain(chain, lat!, lng!))
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

    return Response.json({ stores, precise });
  }),
};

/* To invoke locally:

  1. Run `supabase start` then `supabase secrets set --env-file .env.local GOOGLE_PLACES_API_KEY=...`
     (or export it before `supabase functions serve`)
  2. Make an HTTP request:

  # Precise path (real device coords):
  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/nearest-stores' \
    --header 'apiKey: <anon key>' \
    --header 'Content-Type: application/json' \
    --data '{"lat":49.2827,"lng":-123.1207}'

  # Coarse IP-fallback path (no lat/lng -- resolves from the caller's own
  # IP via ip-api.com). Locally this will usually fail to resolve
  # (loopback/private IP), returning { stores: [], precise: false } --
  # that's expected; test the real fallback against the deployed function
  # instead, or set X-Forwarded-For to a real public IP to simulate it:
  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/nearest-stores' \
    --header 'apiKey: <anon key>' \
    --header 'Content-Type: application/json' \
    --header 'X-Forwarded-For: 8.8.8.8' \
    --data '{}'

*/
