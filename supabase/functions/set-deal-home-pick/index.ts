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
// Free deals (20261026030000_curated_deals_home_free.sql): up to 3 of
// the week's picks marked free for non-members. Removing a pick clears
// its free mark.
//
// Client contract:
//   POST { deal_id: string (uuid), picked: boolean }   add / remove a pick
//   POST { deal_id: string (uuid), free: boolean }     mark a pick free / not
//   -> 200 { picks: { id: string, home_pick: number | null, home_free: boolean }[] }
//      every deal of that week that is or was just a pick

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const MAX_PICKS = 12;
const MAX_FREE = 3;

interface Database {
  __InternalSupabase: { PostgrestVersion: string };
  public: {
    Tables: {
      curated_deals: {
        Row: { id: string; published: boolean; home_pick: number | null; home_free: boolean; zone: string | null };
        Insert: never;
        Update: { home_pick?: number | null; home_free?: boolean };
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
    let body: { deal_id?: unknown; picked?: unknown; free?: unknown };
    try {
      body = await req.json();
    } catch {
      return validationError("Request body must be valid JSON.");
    }

    const { deal_id, picked, free } = body;
    if (typeof deal_id !== "string" || deal_id.length === 0) {
      return validationError("deal_id is required.");
    }
    if (typeof picked !== "boolean" && typeof free !== "boolean") {
      return validationError("Send picked or free, true or false.");
    }

    const db = ctx.supabaseAdmin;
    const { data: deal, error: dealError } = await db
      .from("curated_deals")
      .select("id, published, home_pick, home_free, zone")
      .eq("id", deal_id)
      .single();
    if (dealError || !deal) {
      return Response.json({ error: dealError?.message ?? "Deal not found." }, { status: 404 });
    }

    // Zone-limited deals only show to shoppers in that zone, so as a Home
    // pick they'd be missing for everyone else (Anabelle, 2026-10-26).
    if (picked === true && deal.zone) {
      return validationError(`Only valid in ${deal.zone}, so it can't be a Home deal.`);
    }

    const { data: current, error: listError } = await db
      .from("curated_deals")
      .select("id, published, home_pick, home_free, zone")
      .eq("published", deal.published)
      .not("home_pick", "is", null)
      .order("home_pick");
    if (listError) {
      return Response.json({ error: listError.message }, { status: 500 });
    }
    const rows = current ?? [];

    // Target state for every pick of the week (plus this deal).
    const order = rows.map((row) => row.id).filter((id) => id !== deal_id);
    const freeIds = new Set(rows.filter((row) => row.home_free).map((row) => row.id));
    if (typeof picked === "boolean") {
      if (picked) {
        if (deal.home_pick === null && order.length >= MAX_PICKS) {
          return validationError(`Home shows ${MAX_PICKS} deals. Remove one first.`);
        }
        // Already picked: keeps its place.
        if (deal.home_pick !== null) order.splice(deal.home_pick - 1, 0, deal_id);
        else order.push(deal_id);
      } else {
        freeIds.delete(deal_id);
      }
    } else {
      if (deal.home_pick === null) {
        return validationError("Add it to Home first; free deals are picked from the Home deals.");
      }
      order.splice(deal.home_pick - 1, 0, deal_id);
      if (free) {
        if (!freeIds.has(deal_id) && freeIds.size >= MAX_FREE) {
          return validationError(`Non-members get ${MAX_FREE} free deals. Unmark one first.`);
        }
        freeIds.add(deal_id);
      } else {
        freeIds.delete(deal_id);
      }
    }

    const before = new Map(rows.map((row) => [row.id, row]));
    const after = new Map<string, { home_pick: number | null; home_free: boolean }>(
      order.map((id, index) => [id, { home_pick: index + 1, home_free: freeIds.has(id) }])
    );
    if (!after.has(deal_id)) after.set(deal_id, { home_pick: null, home_free: false });

    const picks: { id: string; home_pick: number | null; home_free: boolean }[] = [];
    // Only rows that changed are written.
    for (const [id, next] of after) {
      const prev = before.get(id);
      if (!prev || prev.home_pick !== next.home_pick || prev.home_free !== next.home_free) {
        const { error } = await db.from("curated_deals").update(next).eq("id", id);
        if (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }
      }
      picks.push({ id, ...next });
    }
    return Response.json({ picks });
  }),
};
