// Bulk approve / reject for app/app/dev-deals.tsx (Anabelle, 2026-09-30:
// "OMG still 353 ... its not realistic" -- one deal at a time through the
// full edit form took ~2 hours for 65 deals). Marks many curated_deals
// rows approved or rejected in one call, as reviewed, without touching
// their pricing. Pricing fixes still go through update-curated-deal-
// pricing from the deal screen.
//
// Client contract:
//   POST { deal_ids: string[] (1-500), status: 'approved' | 'rejected' }
//     -> 200 { updated: CuratedDeal[], skipped: string[] }
//   A deal with no price can't be approved (it would show "Unknown" to
//   shoppers) -- it's left as it was and listed in `skipped`.
//
// Same auth as update-curated-deal-pricing: reachable with the
// publishable key; the calling screen is __DEV__-only.
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

type Status = "approved" | "rejected";

interface CuratedDealRow {
  id: string;
  price: number | null;
  published: boolean;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  pricing_reviewed_at: string | null;
}

interface Database {
  __InternalSupabase: { PostgrestVersion: string };
  public: {
    Tables: {
      curated_deals: {
        Row: CuratedDealRow;
        Insert: never;
        Update: {
          status?: Status;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          pricing_reviewed_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      refresh_recipe_deal_tags: { Args: { p_published: boolean }; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

const MAX_IDS = 500;

function validationError(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export default {
  fetch: withSupabase<Database>({ auth: ["publishable"] }, async (req, ctx) => {
    let body: { deal_ids?: unknown; status?: unknown };
    try {
      body = await req.json();
    } catch {
      return validationError("Request body must be valid JSON.");
    }
    const { deal_ids, status } = body;
    if (
      !Array.isArray(deal_ids) ||
      deal_ids.length === 0 ||
      deal_ids.length > MAX_IDS ||
      !deal_ids.every((id) => typeof id === "string" && id.length > 0)
    ) {
      return validationError(`deal_ids must be 1 to ${MAX_IDS} deal ids.`);
    }
    if (status !== "approved" && status !== "rejected") {
      return validationError("status must be 'approved' or 'rejected'.");
    }
    const ids = Array.from(new Set(deal_ids as string[]));

    let skipped: string[] = [];
    let targets = ids;
    if (status === "approved") {
      const { data: priceless, error } = await ctx.supabaseAdmin
        .from("curated_deals")
        .select("id")
        .in("id", ids)
        .is("price", null);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      skipped = (priceless ?? []).map((row) => row.id);
      targets = ids.filter((id) => !skipped.includes(id));
    }

    let updated: CuratedDealRow[] = [];
    if (targets.length > 0) {
      const now = new Date().toISOString();
      const { data, error } = await ctx.supabaseAdmin
        .from("curated_deals")
        .update({ status: status as Status, reviewed_by: "dev-deals-bulk", reviewed_at: now, pricing_reviewed_at: now })
        .in("id", targets)
        .select();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      updated = data ?? [];
    }

    // Re-price recipes for each week touched, in the background -- same
    // reasoning as update-curated-deal-pricing (the full refresh is slow
    // and the status change is already committed).
    for (const published of new Set(updated.map((row) => row.published))) {
      EdgeRuntime.waitUntil(
        ctx.supabaseAdmin.rpc("refresh_recipe_deal_tags", { p_published: published }).then(({ error }) => {
          if (error) console.error("refresh_recipe_deal_tags failed after bulk status change:", error.message);
        }),
      );
    }

    return Response.json({ updated, skipped });
  }),
};
