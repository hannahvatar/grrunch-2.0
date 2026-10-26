// Adds a deal to, or removes it from, Home's hand-picked Top deals (see
// supabase/migrations/20261026010000_curated_deals_home_pick.sql). Built
// for app/app/dev-deals.tsx, same pattern and same accepted-risk
// reasoning as set-recipe-star-deals: curated_deals has no
// client-writable RLS policy, so the write goes through the service role;
// the calling screen is __DEV__-gated, and the worst case is changing
// which deals Home showcases.
//
// Picks are per week (the deal's own `published` value: live or draft).
// A new pick goes last; removing one closes the gap, so the week's picks
// always read 1..n.
//
// Client contract:
//   POST { deal_id: string (uuid), picked: boolean }
//   -> 200 { picks: { id: string, home_pick: number | null }[] }
//      every deal of that week whose home_pick changed or is set

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const MAX_PICKS = 12;

interface Database {
  __InternalSupabase: { PostgrestVersion: string };
  public: {
    Tables: {
      curated_deals: {
        Row: { id: string; published: boolean; home_pick: number | null; zone: string | null };
        Insert: never;
        Update: { home_pick?: number | null };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

function validationError(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export default {
  fetch: withSupabase<Database>({ auth: ["publishable"] }, async (req, ctx) => {
    let body: { deal_id?: unknown; picked?: unknown };
    try {
      body = await req.json();
    } catch {
      return validationError("Request body must be valid JSON.");
    }

    const { deal_id, picked } = body;
    if (typeof deal_id !== "string" || deal_id.length === 0) {
      return validationError("deal_id is required.");
    }
    if (typeof picked !== "boolean") {
      return validationError("picked must be true or false.");
    }

    const db = ctx.supabaseAdmin;
    const { data: deal, error: dealError } = await db
      .from("curated_deals")
      .select("id, published, home_pick, zone")
      .eq("id", deal_id)
      .single();
    if (dealError || !deal) {
      return Response.json({ error: dealError?.message ?? "Deal not found." }, { status: 404 });
    }

    // Zone-limited deals only show to shoppers in that zone, so as a Home
    // pick they'd be missing for everyone else (Anabelle, 2026-10-26).
    if (picked && deal.zone) {
      return validationError(`Only valid in ${deal.zone}, so it can't be a Home deal.`);
    }

    const { data: current, error: listError } = await db
      .from("curated_deals")
      .select("id, published, home_pick")
      .eq("published", deal.published)
      .not("home_pick", "is", null)
      .order("home_pick");
    if (listError) {
      return Response.json({ error: listError.message }, { status: 500 });
    }

    const order = (current ?? []).map((row) => row.id).filter((id) => id !== deal_id);
    if (picked) {
      if (order.length >= MAX_PICKS) {
        return validationError(`Home shows ${MAX_PICKS} deals. Remove one first.`);
      }
      order.push(deal_id);
    }

    const before = new Map((current ?? []).map((row) => [row.id, row.home_pick]));
    const after = new Map<string, number | null>(order.map((id, index) => [id, index + 1]));
    if (!picked) after.set(deal_id, null);

    const picks: { id: string; home_pick: number | null }[] = [];
    // Only rows whose place changed are written.
    for (const [id, homePick] of after) {
      if ((before.get(id) ?? null) === homePick) {
        picks.push({ id, home_pick: homePick });
        continue;
      }
      const { error } = await db.from("curated_deals").update({ home_pick: homePick }).eq("id", id);
      if (error) {
        return Response.json({ error: error.message }, { status: 500 });
      }
      picks.push({ id, home_pick: homePick });
    }
    return Response.json({ picks });
  }),
};
