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
//     item_name: string,
//     price: number | null, original_price: number | null,
//     price_unit: 'package' | 'each' | 'lb' | 'kg' | '100g',
//     package_weight_g: number | null,
//     package_weight_g_source: 'label' | 'measured' | 'estimated' | null,
//     quantity_estimated: boolean,
//     original_price_source: 'flyer' | 'reference',
//     usage: 'recipes' | 'deals' | 'both',
//     keyword_matches: string[],
//     reject?: boolean,
//   }
//   -> 200 { deal: CuratedDealRow }
//
// keyword_matches: human-curated generic-category tags (e.g. "chicken
// breast", "beans") checked by refresh_recipe_deal_tags()'s keyword
// fallback pass -- see 20260808040000_deal_keyword_matches.sql. Used to
// only ever be set during the separate Airtable review pass; that step
// is gone (folded into this screen, same as usage above), so this is
// now the only place it can be set at all. Same
// trim-empty/dedupe-on-save contract as the client's tag-chip editor.
//
// usage: Anabelle's own recipes/deals/both classification for what
// this deal is good for -- see supabase/migrations/20260819010000_
// curated_deals_usage_classification.sql. Used to only ever be set by
// the Airtable review agents at sync time and never touchable again;
// now freely re-correctable here, same as every other pricing field
// (Anabelle: "why cant I have a chip option where i select deals,
// recipes or both").
//
// original_price_source: 'flyer' means original_price is a real price
// the store printed; 'reference' means it's a StatCan/human-researched
// comparison price WE derived (see resolve_produce_gaps() in
// scripts/sync_weekly_deals.py) -- never printed on any flyer. The live
// app never shows a 'reference' original_price with the same
// strikethrough+"N% off" treatment as a 'flyer' one (see
// app/lib/curatedDeals.ts), so this needs to be reviewable/correctable
// here same as every other pricing field. See
// supabase/migrations/20260812000000_curated_deals_original_price_source.sql.
//
// item_name is editable here (not just price/quantity/unit) because a
// single flyer cutout sometimes names two distinct products joined by
// "or" (e.g. "BOURSIN CHEESE 150/220 g or MARCANGELO CHARCUTERIE
// 85/175 g") -- see duplicate-curated-deal/index.ts, which splits that
// into two rows Anabelle then renames individually via this field.
//
// price null means genuinely unknown -- not yet confirmed from the
// cutout photo (see the column comments in
// 20260811010000_curated_deals_unknown_price_and_reject.sql). A
// null-priced deal is simply never tagged onto a recipe until resolved
// (compute_deal_tag_pricing() treats it the same as an unscalable
// weight) -- AND, if the row was 'approved', this also downgrades
// status to 'pending' (unless reject below already sets it to
// 'rejected'). Without that downgrade, a null-priced-but-still-
// 'approved' row would keep passing the "approved curated_deals are
// publicly readable" RLS policy and could reach lib/curatedDeals.ts's
// fetchAllDeals()/fetchDealsByIds() (the Best Deals tab), which assume
// a real number -- an unknown price means "not ready to show a
// shopper," same as a rejected one.
//
// original_price null does NOT trigger this downgrade (real bug, fixed
// 20260819 -- Anabelle: "Saving with Unknown should stay/become
// approved" after reviewing and saving a legitimately no-printed-
// regular-price item like Swiss Chalet ribs silently dropped it out of
// every recipe's pricing). A null original_price is a common, COMPLETE
// state for most flat-sale-price flyer items, not an unfinished one --
// and on this client it can only ever reach here via the explicit
// "Original price is unknown" checkbox (buildBody() in dev-deals.tsx
// rejects a blank-but-unchecked field as NaN before submit), so it's
// always a deliberate confirmation, never an accidental gap.
// compute_deal_tag_pricing() already treats a null original_price as
// "same as price, 0% discount" (20260819000000_deal_tag_null_original_
// price_fix.sql), so there's no pricing reason to exclude it either --
// only price === null still means genuinely not ready.
//
// reject: true sets status='rejected' (plus reviewed_by/reviewed_at,
// the same fields the separate Airtable approve/reject workflow uses)
// -- for a deal that, on closer look at its cutout, turns out not to
// be a real/good deal at all. Whatever price/quantity fields were also
// filled in are saved at the same time, nothing entered is lost.
// status='rejected' already excludes the row from
// refresh_recipe_deal_tags() (both passes only ever select
// status='approved'), so rejecting immediately stops it being tagged
// onto any recipe, same as the price-unknown case above.
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

type OriginalPriceSource = "flyer" | "reference";
const ORIGINAL_PRICE_SOURCES: OriginalPriceSource[] = ["flyer", "reference"];

// 'both' was dropped (20260819030000_curated_deals_usage_drop_both.sql)
// -- it was always functionally identical to 'recipes' once Deals-tab
// visibility turned out to be unconditional. Anabelle's own
// description was always this clean binary.
type DealUsage = "recipes" | "deals";
const USAGE_VALUES: DealUsage[] = ["recipes", "deals"];

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
          usage: DealUsage;
        };
        Insert: never;
        Update: {
          item_name?: string;
          price?: number | null;
          original_price?: number | null;
          price_unit?: DealPriceUnit;
          package_weight_g?: number | null;
          package_weight_g_source?: PackageWeightSource | null;
          quantity_estimated?: boolean;
          pricing_reviewed_at?: string | null;
          original_price_source?: OriginalPriceSource;
          usage?: DealUsage;
          keyword_matches?: string[];
          status?: "pending" | "approved" | "rejected";
          reviewed_by?: string | null;
          reviewed_at?: string | null;
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
  item_name?: unknown;
  price?: unknown;
  original_price?: unknown;
  price_unit?: unknown;
  package_weight_g?: unknown;
  package_weight_g_source?: unknown;
  quantity_estimated?: unknown;
  original_price_source?: unknown;
  usage?: unknown;
  keyword_matches?: unknown;
  reject?: unknown;
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

    const {
      deal_id,
      item_name,
      price,
      original_price,
      price_unit,
      package_weight_g,
      package_weight_g_source,
      quantity_estimated,
      original_price_source,
      usage,
      keyword_matches,
      reject,
    } = body;

    if (typeof deal_id !== "string" || deal_id.length === 0) {
      return validationError("deal_id is required.");
    }
    if (typeof item_name !== "string" || item_name.trim().length === 0) {
      return validationError("item_name must be a non-empty string.");
    }
    // null means genuinely unknown (see the client contract comment
    // above) -- not the same as omitted/undefined, which would leave
    // the column untouched instead.
    if (price !== null && (typeof price !== "number" || price < 0)) {
      return validationError("price must be null or a non-negative number.");
    }
    if (original_price !== null && (typeof original_price !== "number" || original_price < 0)) {
      return validationError("original_price must be null or a non-negative number.");
    }
    if (typeof price_unit !== "string" || !PRICE_UNITS.includes(price_unit as DealPriceUnit)) {
      return validationError(`price_unit must be one of: ${PRICE_UNITS.join(", ")}.`);
    }
    if (package_weight_g !== null && (typeof package_weight_g !== "number" || package_weight_g <= 0)) {
      return validationError("package_weight_g must be null or a positive number.");
    }
    // Mirrors the curated_deals_package_weight_g_sane DB constraint
    // (20260820030000_guard_discount_pct_division.sql) -- checked here
    // too so a too-small value produces this clear message instead of a
    // raw Postgres constraint-violation string. Real bug, caught live:
    // "5" typed into this field for a bag of carrots almost certainly
    // meant "5 lb", not "5 g" -- no real grocery package weighs under
    // 10 g, so this always means the wrong unit was entered.
    if (package_weight_g !== null && package_weight_g < 10) {
      return validationError(
        `package_weight_g of ${package_weight_g} is too small to be real (under 10 g) -- if you meant pounds, convert to grams first (1 lb = about 454 g).`
      );
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
    if (
      typeof original_price_source !== "string" ||
      !ORIGINAL_PRICE_SOURCES.includes(original_price_source as OriginalPriceSource)
    ) {
      return validationError(`original_price_source must be one of: ${ORIGINAL_PRICE_SOURCES.join(", ")}.`);
    }
    if (typeof usage !== "string" || !USAGE_VALUES.includes(usage as DealUsage)) {
      return validationError(`usage must be one of: ${USAGE_VALUES.join(", ")}.`);
    }
    if (
      !Array.isArray(keyword_matches) ||
      keyword_matches.some((k) => typeof k !== "string" || k.trim().length === 0)
    ) {
      return validationError("keyword_matches must be an array of non-empty strings.");
    }
    if (reject !== undefined && typeof reject !== "boolean") {
      return validationError("reject must be a boolean.");
    }
    // Trim + dedupe here rather than trusting the client to have done
    // it -- same defensive normalization item_name.trim() already gets
    // below.
    const normalizedKeywordMatches = Array.from(
      new Set(keyword_matches.map((k) => (k as string).trim()).filter((k) => k.length > 0)),
    );

    // A genuinely unknown price means this deal isn't ready to show a
    // shopper -- downgrade it off 'approved' so it stops passing the
    // "approved curated_deals are publicly readable" RLS policy (see
    // the comment at the top of this file). original_price === null
    // does NOT downgrade -- see that comment for why. reject takes
    // priority when both apply (rejecting is a stronger, final signal
    // than "pricing incomplete"). A normal save with a known price
    // explicitly marks 'approved' (not left unchanged) -- hitting Save
    // IS the confirmation signal, so it also recovers a row that had
    // previously been downgraded to 'pending', without a separate
    // re-approval step.
    const statusUpdate =
      reject === true
        ? { status: "rejected" as const, reviewed_by: "dev-deals-screen", reviewed_at: new Date().toISOString() }
        : price === null
          ? { status: "pending" as const }
          : { status: "approved" as const };

    // ctx.supabaseAdmin bypasses RLS -- needed since curated_deals only
    // grants public SELECT (scoped to status='approved'), never INSERT/
    // UPDATE for the anon/authenticated roles (see the RLS policy in
    // supabase/migrations/20260725163230_init_schema.sql -- unchanged
    // by the pricing-review migration, on purpose: writes go through
    // this function, not a new direct-write policy).
    const { data: updated, error } = await ctx.supabaseAdmin
      .from("curated_deals")
      .update({
        item_name: item_name.trim(),
        price: price as number | null,
        original_price: original_price as number | null,
        price_unit: price_unit as DealPriceUnit,
        package_weight_g: package_weight_g as number | null,
        package_weight_g_source: package_weight_g_source as PackageWeightSource | null,
        quantity_estimated,
        original_price_source: original_price_source as OriginalPriceSource,
        usage: usage as DealUsage,
        keyword_matches: normalizedKeywordMatches,
        pricing_reviewed_at: new Date().toISOString(),
        ...statusUpdate,
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
      "item_name": "Bulacan Sweet Longanisa",
      "price": 5.27,
      "original_price": 5.27,
      "price_unit": "package",
      "package_weight_g": null,
      "package_weight_g_source": null,
      "quantity_estimated": false,
      "original_price_source": "flyer",
      "usage": "recipes",
      "keyword_matches": ["longanisa"]
    }'

*/
