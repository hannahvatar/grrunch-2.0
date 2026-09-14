// Multi-result store search, for the "Select a Store" picker on Profile >
// My stores (Anabelle, 2026-09-14: "copy the store selection process from
// canadian tire and apply to our store"). Distinct from nearest-stores/
// index.ts, which only ever keeps the SINGLE closest match per chain (used
// by onboarding to auto-pick 5 stores) -- this function returns up to
// `limit` candidates for ONE chain at a time, so a user can browse and pick
// a specific branch instead of only ever getting whatever's nearest.
//
// Client contract:
//   POST {
//     chain_name: string,      // e.g. "Safeway" -- required
//     lat?: number, lng?: number,  // biases/sorts results by distance
//     city?: string,           // free-text city search (e.g. "Sechelt") --
//                               // takes priority over lat/lng bias when
//                               // both are given, matching the reference
//                               // UI's search box acting independently of
//                               // "use my location"
//     limit?: number,          // default 8, max 10 (Places' own cap)
//   }
//   -> 200 { stores: StoreSearchResult[] }
//
// Every result is upserted into `stores` (same google_place_id-keyed
// upsert nearest-stores already uses) so a store picked here has the same
// stable id whether it was ever surfaced by nearest-stores or not, and
// re-searching the same place later updates the same row instead of
// duplicating it.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

interface Database {
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
          phone: string | null;
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
          phone?: string | null;
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
// Wider than nearest-stores' 25km -- that function only ever needs the
// single closest match, this one needs enough real candidates to make a
// picker worth showing.
const SEARCH_RADIUS_METERS = 50_000;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 10; // Places' own searchText maxResultCount ceiling.

interface GoogleAddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface GoogleOpeningHours {
  openNow?: boolean;
  weekdayDescriptions?: string[];
}

interface GooglePlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  regularOpeningHours?: GoogleOpeningHours;
  currentOpeningHours?: GoogleOpeningHours;
  nationalPhoneNumber?: string;
  addressComponents?: GoogleAddressComponent[];
}

interface StoreSearchResult {
  id: string;
  chainName: string;
  banner: string | null;
  address: string;
  // "Sechelt, BC" -- derived from Places' addressComponents (locality +
  // administrative_area_level_1), matching the reference UI's per-result
  // header line. Null when Places didn't return locality-level components
  // (rare, but real for some rural addresses) -- the client falls back to
  // just the chain name in that case rather than showing a blank line.
  cityLabel: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  openNow: boolean | null;
  // "Closes at 6:00 PM" / "Closed" / null (hours unknown) -- see
  // deriveHoursText below for what's in and out of scope here.
  hoursText: string | null;
  mapsUrl: string;
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

function buildCityLabel(components: GoogleAddressComponent[] | undefined): string | null {
  if (!components) return null;
  const locality = components.find((c) => c.types?.includes("locality"));
  const province = components.find((c) => c.types?.includes("administrative_area_level_1"));
  const city = locality?.longText ?? locality?.shortText;
  const region = province?.shortText;
  if (city && region) return `${city}, ${region}`;
  return city ?? region ?? null;
}

// Deliberately scoped down from a full hours engine: only ever says
// "Closes at <time>" for a currently-open store, or a bare "Closed" for a
// closed one -- never "Opens at <time>" for a closed store, since that
// needs the NEXT period (today's remaining hours or tomorrow's, whichever
// comes first), not just today's description. Anabelle asked for
// "open/closed hours" matching the Canadian Tire reference's "Open .
// Closes at 6:00 PM" line specifically; a real "opens at" computation is a
// bigger, separate piece of work if it's ever needed.
function deriveHoursText(place: GooglePlace): { openNow: boolean | null; hoursText: string | null } {
  const hours = place.currentOpeningHours ?? place.regularOpeningHours;
  const openNow = hours?.openNow ?? null;
  if (openNow !== true) {
    return { openNow, hoursText: openNow === false ? "Closed" : null };
  }
  const descriptions = hours?.weekdayDescriptions;
  if (!descriptions || descriptions.length !== 7) {
    return { openNow, hoursText: null };
  }
  // Places' weekdayDescriptions is Monday-first; JS's getDay() is
  // Sunday-first (0-6) -- this remaps one onto the other.
  const jsDay = new Date().getDay();
  const googleIndex = (jsDay + 6) % 7;
  const today = descriptions[googleIndex];
  // Typical formats: "Monday: 9:00 AM – 9:00 PM" or "Monday: Open 24 hours".
  const afterColon = today.split(": ").slice(1).join(": ");
  if (/open 24 hours/i.test(afterColon)) {
    return { openNow, hoursText: "Open 24 hours" };
  }
  // en dash (–, U+2013) is what Places actually sends, not a hyphen.
  const parts = afterColon.split("–").map((s) => s.trim());
  const closeTime = parts[1];
  return { openNow, hoursText: closeTime ? `Closes at ${closeTime}` : null };
}

async function searchPlaces(
  chainName: string,
  city: string | undefined,
  lat: number | undefined,
  lng: number | undefined,
  limit: number
): Promise<GooglePlace[]> {
  const textQuery = city ? `${chainName} ${city}` : chainName;
  const body: Record<string, unknown> = {
    textQuery,
    maxResultCount: limit,
  };
  // Location bias only makes sense when we're not already narrowing by a
  // specific city name -- otherwise a bias toward the user's current
  // position would fight against the city they just typed.
  if (!city && lat !== undefined && lng !== undefined) {
    body.locationBias = {
      circle: { center: { latitude: lat, longitude: lng }, radius: SEARCH_RADIUS_METERS },
    };
  }

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY ?? "",
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location," +
        "places.regularOpeningHours,places.currentOpeningHours,places.nationalPhoneNumber," +
        "places.addressComponents",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Places API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { places?: GooglePlace[] };
  return data.places ?? [];
}

function validationError(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export default {
  fetch: withSupabase<Database>({ auth: ["publishable"] }, async (req, ctx) => {
    if (!GOOGLE_PLACES_API_KEY) {
      return Response.json(
        { error: "GOOGLE_PLACES_API_KEY is not configured on this Supabase project." },
        { status: 500 }
      );
    }

    let body: {
      chain_name?: unknown;
      lat?: unknown;
      lng?: unknown;
      city?: unknown;
      limit?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return validationError("Request body must be valid JSON.");
    }

    const { chain_name: chainName, lat, lng, city, limit } = body;

    if (typeof chainName !== "string" || chainName.trim().length === 0) {
      return validationError("chain_name is required.");
    }
    const trimmedCity = typeof city === "string" && city.trim().length > 0 ? city.trim() : undefined;
    const numericLat = typeof lat === "number" ? lat : undefined;
    const numericLng = typeof lng === "number" ? lng : undefined;
    const resultLimit =
      typeof limit === "number" && limit > 0 ? Math.min(Math.floor(limit), MAX_LIMIT) : DEFAULT_LIMIT;

    let places: GooglePlace[];
    try {
      places = await searchPlaces(chainName, trimmedCity, numericLat, numericLng, resultLimit);
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
    }

    const withLocation = places.filter((p): p is GooglePlace & { location: NonNullable<GooglePlace["location"]> } =>
      p.location !== undefined
    );

    // Closest-first when we have a real reference point to sort against
    // (either the user's own lat/lng, or -- once city search returns
    // results -- the first result's own location as an anchor, so the rest
    // of that city's results still read in a sensible distance order
    // instead of Places' raw relevance ranking).
    const anchor =
      numericLat !== undefined && numericLng !== undefined
        ? { lat: numericLat, lng: numericLng }
        : withLocation[0]
          ? { lat: withLocation[0].location.latitude, lng: withLocation[0].location.longitude }
          : null;
    const sorted = anchor
      ? [...withLocation].sort(
          (a, b) =>
            haversineMeters(anchor.lat, anchor.lng, a.location.latitude, a.location.longitude) -
            haversineMeters(anchor.lat, anchor.lng, b.location.latitude, b.location.longitude)
        )
      : withLocation;

    const upsertRows = sorted.map((place) => ({
      chain_name: chainName,
      banner: place.displayName?.text ?? null,
      address: place.formattedAddress ?? "",
      lat: place.location.latitude,
      lng: place.location.longitude,
      hours: place.currentOpeningHours ?? place.regularOpeningHours ?? null,
      phone: place.nationalPhoneNumber ?? null,
      google_place_id: place.id,
    }));

    // Same same-batch-dupe guard as nearest-stores/index.ts -- two Places
    // results shouldn't collide on google_place_id within one response,
    // but a same-batch upsert throws Postgres 21000 if they ever did.
    const seenPlaceIds = new Set<string>();
    const dedupedRows = upsertRows.filter((row) => {
      if (seenPlaceIds.has(row.google_place_id)) return false;
      seenPlaceIds.add(row.google_place_id);
      return true;
    });

    if (dedupedRows.length === 0) {
      return Response.json({ stores: [] });
    }

    // ctx.supabaseAdmin bypasses RLS -- stores only grants public SELECT.
    const { data: upserted, error } = await ctx.supabaseAdmin
      .from("stores")
      .upsert(dedupedRows, { onConflict: "google_place_id" })
      .select();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Walk `sorted` (already in the right distance/relevance order) and
    // look up each place's upserted DB row (has the real `id`) by
    // google_place_id -- upsert's own return order isn't guaranteed to
    // match its input order, so building the response by iterating
    // `sorted` directly (rather than `upserted`) keeps the order right
    // without a separate re-sort pass.
    const upsertedByPlaceId = new Map((upserted ?? []).map((row) => [row.google_place_id, row]));
    const results: StoreSearchResult[] = sorted
      .map((place): StoreSearchResult | null => {
        const row = upsertedByPlaceId.get(place.id);
        if (!row || row.lat === null || row.lng === null) return null;
        const { openNow, hoursText } = deriveHoursText(place);
        return {
          id: row.id,
          chainName: row.chain_name,
          banner: row.banner,
          address: row.address,
          cityLabel: buildCityLabel(place.addressComponents),
          phone: row.phone,
          lat: row.lat,
          lng: row.lng,
          openNow,
          hoursText,
          mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.address)}&query_place_id=${row.google_place_id}`,
        };
      })
      .filter((r): r is StoreSearchResult => r !== null);

    return Response.json({ stores: results });
  }),
};

/* To invoke locally:

  1. Run `supabase start` then `supabase secrets set --env-file .env.local GOOGLE_PLACES_API_KEY=...`
     (or export it before `supabase functions serve`)
  2. Make an HTTP request:

  # Nearby search (biased toward lat/lng, closest first):
  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/search-stores' \
    --header 'apiKey: <anon key>' \
    --header 'Content-Type: application/json' \
    --data '{"chain_name":"Safeway","lat":49.2827,"lng":-123.1207}'

  # City search (independent of any current location):
  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/search-stores' \
    --header 'apiKey: <anon key>' \
    --header 'Content-Type: application/json' \
    --data '{"chain_name":"Safeway","city":"Sechelt"}'

*/
