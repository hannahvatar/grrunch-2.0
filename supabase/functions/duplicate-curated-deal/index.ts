// Splits one curated_deals row into two, for a flyer cutout that names
// two distinct products sharing one photo/price (e.g. "BOURSIN CHEESE
// 150/220 g or MARCANGELO CHARCUTERIE 85/175 g") -- Anabelle asked for
// this after finding that case in app/app/dev-deals.tsx: "there are
// cutouts that have 2 items on them. You need to duplicate the cutout
// and have me review the items individually (its how its setup in
// airtable)".
//
// Client contract:
//   POST { deal_id: string (uuid), item_name?: string }
//   -> 200 { source: CuratedDealRow, duplicate: CuratedDealRow }
//
//   POST { deal_id, source_item_name?: string, new_item_names?: string[] }
//   -> 200 { source: CuratedDealRow, duplicates: CuratedDealRow[] }
//
// The second form splits a whole cutout in one call (dev-deals.tsx's
// cutout screen "Split into N deals"): the source is renamed to
// source_item_name and one copy is made per new_item_names entry.
// Anabelle chose to edit each product's name at split time ("A":
// editable names when splitting) after the automatic split of "SEAQUEST
// SHRIMP COOKED ... OR RAW, 51-70 PER LB 160 G" proposed "RAW, 51-70 PER
// LB 160 G" -- a name that loses the brand and can't be fixed later,
// since names are read-only on the item page. Renaming the source too
// means no combined "X or Y" row is left over to reject afterwards.
//
// item_name (optional) names the copy -- dev-deals.tsx's cutout screen
// passes the one product it's splitting off, taken straight from the
// flyer's own combined text (lib/dealNames.ts splitMultiItemName).
// Anabelle: "The name should be fetched from the cutout and displayed
// as is" -- the review screen no longer lets a name be typed by hand, so
// the copy has to arrive already named. Omitted, the copy keeps the
// source's name (the original behavior).
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
// The copy always starts as status='pending' -- it's a product nobody
// has reviewed yet, so it lands in dev-deals' "Needs review" queue
// rather than inheriting an approved source's status and going live to
// shoppers before it's been looked at. The source row's status and
// every row's usage are untouched.
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
  zone: string | null;
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
          item_name?: string;
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
  item_name?: unknown;
  source_item_name?: unknown;
  new_item_names?: unknown;
}

const MAX_NAME_LENGTH = 300;
const MAX_NEW_ROWS = 20;

function isNonBlankName(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value.length <= MAX_NAME_LENGTH;
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

    const { deal_id, item_name, source_item_name, new_item_names } = body;
    if (typeof deal_id !== "string" || deal_id.length === 0) {
      return validationError("deal_id is required.");
    }
    if (item_name !== undefined && (typeof item_name !== "string" || item_name.trim() === "")) {
      return validationError("item_name, when given, must be a non-blank string.");
    }
    if (source_item_name !== undefined && !isNonBlankName(source_item_name)) {
      return validationError(`source_item_name, when given, must be a non-blank string (${MAX_NAME_LENGTH} characters max).`);
    }
    if (
      new_item_names !== undefined &&
      (!Array.isArray(new_item_names) || new_item_names.length > MAX_NEW_ROWS || !new_item_names.every(isNonBlankName))
    ) {
      return validationError(`new_item_names must be an array of up to ${MAX_NEW_ROWS} non-blank names.`);
    }
    const batchForm = source_item_name !== undefined || new_item_names !== undefined;

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

    // Batch form: one copy per new name (possibly none, for a rename
    // only). Single form: exactly one copy, named item_name or the
    // source's own name. Copies always start 'pending' -- see above.
    const names: string[] = batchForm
      ? ((new_item_names as string[] | undefined) ?? []).map((name) => name.trim())
      : [typeof item_name === "string" ? item_name.trim() : source.item_name];

    let duplicates: CuratedDealRow[] = [];
    if (names.length > 0) {
      const { data: inserted, error: insertError } = await ctx.supabaseAdmin
        .from("curated_deals")
        .insert(
          names.map((name) => ({
            ...copyable,
            item_name: name,
            status: "pending" as const,
            airtable_record_id: null,
            pricing_reviewed_at: null,
          })),
        )
        .select();

      if (insertError || !inserted || inserted.length !== names.length) {
        return Response.json({ error: insertError?.message ?? "Duplicate failed." }, { status: 500 });
      }
      duplicates = inserted;
    }

    // The source row's own item_name still describes several products
    // ("X or Y") unless renamed here -- either way it's flagged "Not
    // reviewed" again alongside the fresh copies, rather than left
    // looking already-confirmed.
    const { data: updatedSource, error: updateError } = await ctx.supabaseAdmin
      .from("curated_deals")
      .update({
        pricing_reviewed_at: null,
        ...(typeof source_item_name === "string" ? { item_name: source_item_name.trim() } : {}),
      })
      .eq("id", deal_id)
      .select()
      .single();

    if (updateError || !updatedSource) {
      return Response.json({ error: updateError?.message ?? "Failed to update source row." }, { status: 500 });
    }

    return batchForm
      ? Response.json({ source: updatedSource, duplicates })
      : Response.json({ source: updatedSource, duplicate: duplicates[0] });
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
