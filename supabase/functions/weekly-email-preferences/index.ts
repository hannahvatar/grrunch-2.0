// The weekly email's two buttons, without signing in (2026-11-03):
//   - "Unsubscribe" turns the weekly email off;
//   - "Keep them coming" (only in the one email sent to accounts made
//     before the sign-up box existed) records their consent.
// Both links open app.grrunch.com/email-preferences, which asks the
// person to confirm with a button and then calls this function, so a mail
// scanner opening the link never changes anything. Mail apps' own
// one-click unsubscribe (the List-Unsubscribe header) POSTs here
// directly, with the same signed u/t in the query string.
//
// Client contract:
//   POST { u: userId, t: token, action: "stop" | "keep" } -> 200 { weeklyDeals }
//   POST ?u=&t=&a=stop (List-Unsubscribe=One-Click)          -> 200
//   400 bad request, 403 bad token

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { verifyUserId } from "../_shared/emailLinks.ts";

interface Database {
  __InternalSupabase: { PostgrestVersion: string };
  public: {
    Tables: {
      email_consents: {
        Row: {
          user_id: string;
          weekly_deals: boolean;
          consented_at: string | null;
          source: string | null;
          unsubscribed_at: string | null;
        };
        Insert: {
          user_id: string;
          weekly_deals: boolean;
          consented_at?: string | null;
          source?: string | null;
          unsubscribed_at?: string | null;
          updated_at?: string;
        };
        Update: Record<string, never>;
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
  fetch: withSupabase<Database>({ auth: ["publishable"] }, async (req, ctx) => {
    const query = new URL(req.url).searchParams;
    let u = query.get("u");
    let t = query.get("t");
    let action = query.get("a");
    if (!u) {
      try {
        const body = await req.json();
        u = typeof body.u === "string" ? body.u : null;
        t = typeof body.t === "string" ? body.t : null;
        action = typeof body.action === "string" ? body.action : null;
      } catch {
        return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
      }
    }
    if (!u || !t || (action !== "stop" && action !== "keep")) {
      return Response.json({ error: "Missing link details." }, { status: 400 });
    }
    if (!(await verifyUserId(u, t))) {
      return Response.json({ error: "This link isn't valid." }, { status: 403 });
    }

    const now = new Date().toISOString();
    const row: Database["public"]["Tables"]["email_consents"]["Insert"] =
      action === "keep"
        ? { user_id: u, weekly_deals: true, consented_at: now, source: "email", unsubscribed_at: null, updated_at: now }
        : { user_id: u, weekly_deals: false, unsubscribed_at: now, updated_at: now };
    const { error } = await ctx.supabaseAdmin.from("email_consents").upsert(row, { onConflict: "user_id" });
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ weeklyDeals: action === "keep" });
  }),
};
