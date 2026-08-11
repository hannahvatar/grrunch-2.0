// Writes a human-reviewed pricing correction to one curated_deals row.
// Built for app/app/dev-deals.tsx (the __DEV__-only pricing review
// screen, invisible in any real build) -- lets Anabelle look at a
// deal's own flyer cutout photo and correct price/original_price/
// price_unit/package_weight_g/quantity_estimated by hand, since
// nothing upstream (flyer scraper, Airtable review) currently captures
// whether a stored price is a whole-package total or a per-unit rate.
// See supabase/migrations/20260811000000_curated_deals_pricing_review.sql
// for the columns this writes and why they exist.
//
// Client contract:
//   POST {
//     deal_id: string (uuid),
//     price: number, original_price: number,
//     price_unit: 'package' | 'each' | 'lb' | 'kg' | '100g',
//     package_weight_g: number | null,
//     package_weight_g_source: 'label' | 'measured' | 'estimated' | null,
//     quantity_estimated: boolean,
//   }
//   -> 200 { deal: CuratedDealRow }
//
// Update-only, always scoped by id -- never insert/upsert/delete, and
// never touches any table besides curated_deals (plus the
// refresh_recipe_deal_tags() RPC call below, which only recomputes
// recipes' own deal_tags/price from curated_deals, doesn't write back
// to curated_deals itself). Auth is the same anon/"publishable" key
// every other client call already uses (see nearest-stores/index.ts,
// the one other client-invoked Edge Function in this project) -- no
// extra secret. The screen calling this is __DEV__-gated client-side
// (inert in any shipped build), and the worst case of someone else
// finding this endpoint is limited to editing pricing display fields
// on an existing row, which the next weekly sync overwrites anyway --
// confirmed acceptable, see the plan this function was built from.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

type DealPriceUnit = "package" | "each" | "lb" | "kg" | "100g";
const PRICE_UNITS: DealPriceUnit[] = ["package", "each", "lb", "kg", "100g"];

type PackageWeightSource = "label" | "measured" | "estimated";
const PACKAGE_WEIGHT_SOURCES: PackageWeightSource[] = ["label", "measured", "estimated"];

// Minimal, function-local slice of the schema (just the columns this
// function reads/writes) so it stays deployable on its own, without
// reaching into the Expo app's types/database.ts across the repo --
// same reasoning/pattern as nearest-stores/index.ts.
interface Database {
  __InternalSupabase: { PostgrestVersion: string };
  public: {
    Tables: {
      curated_deals: {
        Row: {
          id: string;
          chain_name: string;
          item_name: string;
          category: string | null;
          price: number;
          original_price: number;
          discount_pct: number | null;
          product_url: string;
          flyer_valid_from: string;
          flyer_valid_to: string;
          image_url: string | null;
          status: "pending" | "approved" | "rejected";
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          airtable_record_id: string | null;
          keyword_matches: string[];
          price_unit: DealPriceUnit;
          package_weight_g: number | null;
          package_weight_g_source: PackageWeightSource | null;
          quantity_estimated: boolean;
          pricing_reviewed_at: string | null;
        };
        Insert: never;
        Update: {
          price?: number;
          original_price?: number;
          price_unit?: DealPriceUnit;
          package_weight_g?: number | null;
          package_weight_g_source?: PackageWeightSource | null;
          quantity_estimated?: boolean;
          pricing_reviewed_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      refresh_recipe_deal_tags: { Args: Record<string, never>; Returns: void };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

interface RequestBody {
  deal_id?: unknown;
  price?: unknown;
  original_price?: unknown;
  price_unit?: unknown;
  package_weight_g?: unknown;
  package_weight_g_source?: unknown;
  quantity_estimated?: unknown;
}

function validationError(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export default {
  fetch: withSupabase<Database>({ auth: ["publishable"] }, async (req, ctx) => {
    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return validationError("Request body must be valid JSON.");
    }

    const { deal_id, price, original_price, price_unit, package_weight_g, package_weight_g_source, quantity_estimated } = body;

    if (typeof deal_id !== "string" || deal_id.length === 0) {
      return validationError("deal_id is required.");
    }
    if (typeof price !== "number" || price < 0) {
      return validationError("price must be a non-negative number.");
    }
    if (typeof original_price !== "number" || original_price < 0) {
      return validationError("original_price must be a non-negative number.");
    }
    if (typeof price_unit !== "string" || !PRICE_UNITS.includes(price_unit as DealPriceUnit)) {
      return validationError(`price_unit must be one of: ${PRICE_UNITS.join(", ")}.`);
    }
    if (package_weight_g !== null && (typeof package_weight_g !== "number" || package_weight_g <= 0)) {
      return validationError("package_weight_g must be null or a positive number.");
    }
    if (
      package_weight_g_source !== null &&
      (typeof package_weight_g_source !== "string" ||
        !PACKAGE_WEIGHT_SOURCES.includes(package_weight_g_source as PackageWeightSource))
    ) {
      return validationError(`package_weight_g_source must be null or one of: ${PACKAGE_WEIGHT_SOURCES.join(", ")}.`);
    }
    if (typeof quantity_estimated !== "boolean") {
      return validationError("quantity_estimated must be a boolean.");
    }

    // ctx.supabaseAdmin bypasses RLS -- needed since curated_deals only
    // grants public SELECT (scoped to status='approved'), never INSERT/
    // UPDATE for the anon/authenticated roles (see the RLS policy in
    // supabase/migrations/20260725163230_init_schema.sql -- unchanged
    // by the pricing-review migration, on purpose: writes go through
    // this function, not a new direct-write policy).
    const { data: updated, error } = await ctx.supabaseAdmin
      .from("curated_deals")
      .update({
        price,
        original_price,
        price_unit: price_unit as DealPriceUnit,
        package_weight_g: package_weight_g as number | null,
        package_weight_g_source: package_weight_g_source as PackageWeightSource | null,
        quantity_estimated,
        pricing_reviewed_at: new Date().toISOString(),
      })
      .eq("id", deal_id)
      .select()
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Recompute every recipe's deal_tags/price immediately so the
    // correction shows up right away -- refresh_recipe_deal_tags() is
    // otherwise only ever invoked manually, at the bottom of a
    // migration (see supabase/migrations/20260811000000_curated_deals_pricing_review.sql).
    // Best-effort: a refresh failure here shouldn't hide that the
    // pricing correction itself succeeded, but IS surfaced so the
    // caller knows a manual refresh may still be needed.
    const { error: refreshError } = await ctx.supabaseAdmin.rpc("refresh_recipe_deal_tags");

    return Response.json({
      deal: updated,
      refreshError: refreshError ? refreshError.message : undefined,
    });
  }),
};

/* To invoke locally:

  1. Run `supabase start` then `supabase functions serve`
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/update-curated-deal-pricing' \
    --header 'apiKey: <anon key>' \
    --header 'Content-Type: application/json' \
    --data '{
      "deal_id": "00000000-0000-0000-0000-000000000000",
      "price": 5.27,
      "original_price": 5.27,
      "price_unit": "package",
      "package_weight_g": null,
      "package_weight_g_source": null,
      "quantity_estimated": false
    }'

*/
