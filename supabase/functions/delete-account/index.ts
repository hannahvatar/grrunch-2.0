// Real account deletion — Settings > Manage account > Delete account
// (Anabelle, 2026-08-28). supabase-js has no client-callable "delete my
// own account" method (auth.admin.* is service-role only), so this is a
// thin, security-critical bridge: verify the caller's own access token
// identifies a real user, then admin-delete exactly that user. The id
// deleted is always the one derived from the caller's own token, never
// an id read from the request body (which anyone could spoof).
//
// public.users/sessions/subscriptions all have `on delete cascade` FKs to
// auth.users (see 20260725163230_init_schema.sql,
// 20260803000000_subscriptions.sql), so deleting the auth user cascades
// through this app's owned data automatically — no manual table cleanup
// needed here. meal_plans.user_id is `on delete set null` by that same
// migration's existing design, unaffected by this change.
//
// Client contract:
//   POST (no body needed) — supabase.functions.invoke() automatically
//   attaches the caller's own session as the Authorization header.
//   -> 200 { success: true }
//   -> 401 if there's no valid signed-in session
//   -> 500 on an actual delete failure

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

// No table access needed — this function only calls the Auth admin API,
// not `.from(...)` — so the schema slice stays empty rather than
// reaching into the Expo app's full types/database.ts.
interface Database {
  __InternalSupabase: { PostgrestVersion: string };
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export default {
  fetch: withSupabase<Database>({ auth: ["publishable"] }, async (req, ctx) => {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return Response.json({ error: "Not signed in." }, { status: 401 });
    }

    // Validates the token against Supabase Auth and returns the real user
    // it belongs to — this is what makes it safe to trust as "the caller",
    // rather than trusting anything the client claims about its own identity.
    const { data: userData, error: userError } = await ctx.supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      return Response.json({ error: "Not signed in." }, { status: 401 });
    }

    const { error: deleteError } = await ctx.supabaseAdmin.auth.admin.deleteUser(userData.user.id);
    if (deleteError) {
      return Response.json({ error: deleteError.message }, { status: 500 });
    }

    return Response.json({ success: true });
  }),
};
