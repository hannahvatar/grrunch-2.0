// Read-only, ALL-status listing of curated_deals for
// app/app/dev-deals.tsx's review queue. Needed because the only RLS
// policy on curated_deals ("approved curated_deals are publicly
// readable", status='approved' -- supabase/migrations/
// 20260725163230_init_schema.sql) applies to every non-service-role
// caller, including the same anon-key client every other screen uses
// (app/lib/supabase.ts) -- dev-deals.tsx querying the table directly
// can NEVER see a pending/rejected row, no matter what it asks for,
// because Postgres filters it out before the client's own query even
// runs. This function uses the service-role client (ctx.supabaseAdmin,
// same as update-curated-deal-pricing/duplicate-curated-deal) to
// bypass that, same one-function-per-concern convention as the rest of
// this project's Edge Functions.
//
// Built as part of collapsing dev-deals.tsx's old approved-only review
// pass and Airtable's separate Select=Approved gate into one single
// review, entirely in dev-deals.tsx (Anabelle: "why do I approve deals
// twice: in Airtable and in the page dev-deals" / "I would like to do
// all at once in dev-deals"). See scripts/sync_weekly_deals.py's
// sync_curated_deals() -- every candidate now syncs as status='pending'
// instead of 'approved', so this screen needs to be able to see
// pending (and rejected, for accountability/undo) rows too.
//
// Client contract:
//   POST {} -> 200 { deals: CuratedDealRow[] }
//
// Read-only, no filtering server-side -- dev-deals.tsx already does its
// own status-tab/search/reviewed filtering client-side over the full
// set (curated_deals is wiped+rebuilt weekly, so row count stays
// small, ~100 rows -- no pagination needed).
//
// Auth is the anon/"publishable" key, same as every other client-
// invoked function here -- this DOES mean anyone with the (public,
// shipped-in-app) anon key can read every pending/rejected deal's
// pricing/review state via this endpoint directly, same accepted-risk
// precedent as update-curated-deal-pricing/duplicate-curated-deal
// already establish for writes. The screen calling this is __DEV__-
// gated client-side (inert in any shipped build); worst case here is
// read of not-yet-reviewed pricing data, not a write/corruption risk.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

type DealPriceUnit = "package" | "each" | "lb" | "kg" | "100g";
type PackageWeightSource = "label" | "measured" | "estimated";
type OriginalPriceSource = "flyer" | "reference";
type DealUsage = "recipes" | "deals";

// Minimal, function-local slice of the schema -- same pattern/fields as
// update-curated-deal-pricing/index.ts and duplicate-curated-deal/index.ts,
// kept independently deployable.
interface CuratedDealRow {
  id: string;
  chain_name: string;
  item_name: string;
  category: string | null;
  price: number | null;
  original_price: number | null;
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
  original_price_source: OriginalPriceSource;
  fragment_by_weight: boolean;
  used_in_recipe: boolean;
  usage: DealUsage;
}

interface Database {
  __InternalSupabase: { PostgrestVersion: string };
  public: {
    Tables: {
      curated_deals: {
        Row: CuratedDealRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export default {
  fetch: withSupabase<Database>({ auth: ["publishable"] }, async (_req, ctx) => {
    const { data, error } = await ctx.supabaseAdmin
      .from("curated_deals")
      .select("*")
      .order("item_name");

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ deals: data ?? [] });
  }),
};

/* To invoke locally:

  1. Run `supabase start` then `supabase functions serve`
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/list-curated-deals-for-review' \
    --header 'apiKey: <anon key>' \
    --header 'Content-Type: application/json' \
    --data '{}'

*/
