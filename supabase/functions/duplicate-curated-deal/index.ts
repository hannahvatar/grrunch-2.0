// Splits one curated_deals row into two, for a flyer cutout that names
// two distinct products sharing one photo/price (e.g. "BOURSIN CHEESE
// 150/220 g or MARCANGELO CHARCUTERIE 85/175 g") -- Anabelle asked for
// this after finding that case in app/app/dev-deals.tsx: "there are
// cutouts that have 2 items on them. You need to duplicate the cutout
// and have me review the items individually (its how its setup in
// airtable)".
//
// Client contract:
//   POST { deal_id: string (uuid) }
//   -> 200 { source: CuratedDealRow, duplicate: CuratedDealRow }
//
// A fresh INSERT, not an extension of update-curated-deal-pricing --
// insert is a different concern from that function's update-only,
// single-row-by-id design (same one-function-per-concern convention as
// nearest-stores/sync-statcan-prices/update-curated-deal-pricing).
//
// The duplicate copies every reviewable field from the source
// (item_name, chain_name, price, original_price, price_unit, etc.) as
// a starting point, EXCEPT:
//   - id: a new uuid (default)
//   - created_at: a new default (this row is new, even though the
//     underlying flyer data isn't)
//   - airtable_record_id: cleared to null -- it's UNIQUE, copying the
//     source's value verbatim would violate that constraint. This also
//     means the duplicate has no Airtable counterpart; that's expected,
//     Airtable's own copy of this workflow works the same way per
//     Anabelle's "its how its setup in airtable" framing.
//   - discount_pct: never included in an insert payload, Postgres
//     computes it (generated column).
//   - pricing_reviewed_at: reset to null on BOTH rows. Neither the
//     original (whose item_name still says the combined "X or Y" label
//     until renamed) nor the copy has been individually reviewed yet --
//     both need to show "Not reviewed" in the list until each is
//     confirmed/renamed on its own.
//
// Doesn't touch status or usage -- both rows keep whatever the source
// had (dev-deals.tsx now lists every status, so both stay visible
// while awaiting individual review regardless; a full price/name/
// classification mistake on either can still be corrected or rejected
// afterward via update-curated-deal-pricing, same as any other row).
//
// The local CuratedDealRow type below used to be missing
// original_price_source/fragment_by_weight/used_in_recipe -- those
// were already being copied correctly at runtime (source is a real
// object from select("*"), and object-spread doesn't care what a
// TS interface declares), just mistyped. Widened the type here to
// match reality, and added the new `usage` column (see
// 20260819010000_curated_deals_usage_classification.sql) the same way.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

type DealPriceUnit = "package" | "each" | "lb" | "kg" | "100g";
type PackageWeightSource = "label" | "measured" | "estimated";

// Minimal, function-local slice of the schema -- same pattern as
// update-curated-deal-pricing/index.ts, kept independently deployable.
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
  original_price_source: "flyer" | "reference";
  fragment_by_weight: boolean;
  used_in_recipe: boolean;
  usage: "recipes" | "deals";
}

interface Database {
  __InternalSupabase: { PostgrestVersion: string };
  public: {
    Tables: {
      curated_deals: {
        Row: CuratedDealRow;
        Insert: Omit<CuratedDealRow, "id" | "created_at" | "discount_pct"> & {
          id?: string;
          created_at?: string;
        };
        Update: {
          pricing_reviewed_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

interface RequestBody {
  deal_id?: unknown;
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

    const { deal_id } = body;
    if (typeof deal_id !== "string" || deal_id.length === 0) {
      return validationError("deal_id is required.");
    }

    // ctx.supabaseAdmin bypasses RLS -- curated_deals only grants
    // public SELECT scoped to status='approved' (see the comment in
    // update-curated-deal-pricing/index.ts); no INSERT/UPDATE policy
    // exists for any client role, on purpose.
    const { data: source, error: fetchError } = await ctx.supabaseAdmin
      .from("curated_deals")
      .select("*")
      .eq("id", deal_id)
      .single();

    if (fetchError || !source) {
      return Response.json({ error: fetchError?.message ?? "Deal not found." }, { status: 404 });
    }

    const { id: _id, created_at: _createdAt, discount_pct: _discountPct, ...copyable } = source;

    const { data: duplicate, error: insertError } = await ctx.supabaseAdmin
      .from("curated_deals")
      .insert({
        ...copyable,
        airtable_record_id: null,
        pricing_reviewed_at: null,
      })
      .select()
      .single();

    if (insertError || !duplicate) {
      return Response.json({ error: insertError?.message ?? "Duplicate failed." }, { status: 500 });
    }

    // The source row's own item_name still describes both products
    // ("X or Y") until Anabelle renames it too -- flag it "Not
    // reviewed" again alongside the fresh duplicate, rather than
    // leaving it looking already-confirmed.
    const { data: updatedSource, error: updateError } = await ctx.supabaseAdmin
      .from("curated_deals")
      .update({ pricing_reviewed_at: null })
      .eq("id", deal_id)
      .select()
      .single();

    if (updateError || !updatedSource) {
      return Response.json({ error: updateError?.message ?? "Failed to reset source row." }, { status: 500 });
    }

    return Response.json({ source: updatedSource, duplicate });
  }),
};

/* To invoke locally:

  1. Run `supabase start` then `supabase functions serve`
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/duplicate-curated-deal' \
    --header 'apiKey: <anon key>' \
    --header 'Content-Type: application/json' \
    --data '{
      "deal_id": "00000000-0000-0000-0000-000000000000"
    }'

*/
