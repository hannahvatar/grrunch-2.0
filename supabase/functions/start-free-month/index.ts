// 30 days of full access from sign-up, no card (Anabelle, 2026-11-02:
// people landed on a locked app and had to start a trial first, and
// dropped off). The app calls this once a signed-in account in BC has
// never been a member (lib/purchases.tsx); it grants RevenueCat's
// membership entitlement as a promotional grant ending in 30 days, so the
// app, the countdown and the RevenueCat dashboard all see it like any
// other membership. On day 31 it expires and the normal "Your free trial
// has ended" + Subscribe flow takes over.
//
// One free month per account, ever: public.free_months is claimed first
// (insert, primary key on user_id), and anyone with a subscriptions row
// already (a paid plan, a store trial, a past grant) is skipped.
//
// Secrets (supabase secrets set ...): REVENUECAT_SECRET_API_KEY (a V2
// secret key with customer purchases write access), REVENUECAT_PROJECT_ID
// (proj...), REVENUECAT_ENTITLEMENT_ID (entl..., the grrunch_membership
// entitlement's id, not its identifier).
//
// Client contract:
//   POST (no body) -- supabase.functions.invoke() attaches the session.
//   -> 200 { granted: true, endsAt } or { granted: false } (already used)
//   -> 401 not signed in, 500/502 on a failure (safe to retry later)

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

interface Database {
  __InternalSupabase: { PostgrestVersion: string };
  public: {
    Tables: {
      free_months: {
        Row: { user_id: string; granted_at: string; ends_at: string | null };
        Insert: { user_id: string; ends_at?: string | null };
        Update: { ends_at?: string | null };
        Relationships: [];
      };
      subscriptions: {
        Row: { user_id: string; status: string; trial_ends_at: string | null };
        Insert: { user_id: string; status: string; trial_ends_at?: string | null };
        Update: { status?: string; trial_ends_at?: string | null };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

const FREE_DAYS = 30;

export default {
  fetch: withSupabase<Database>({ auth: ["publishable"] }, async (req, ctx) => {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return Response.json({ error: "Not signed in." }, { status: 401 });
    }
    // The user always comes from the caller's own token, never the body.
    const { data: userData, error: userError } = await ctx.supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      return Response.json({ error: "Not signed in." }, { status: 401 });
    }
    const userId = userData.user.id;

    const apiKey = Deno.env.get("REVENUECAT_SECRET_API_KEY");
    const projectId = Deno.env.get("REVENUECAT_PROJECT_ID");
    const entitlementId = Deno.env.get("REVENUECAT_ENTITLEMENT_ID");
    if (!apiKey || !projectId || !entitlementId) {
      return Response.json({ error: "Free month isn't set up yet." }, { status: 500 });
    }

    // Already a member at some point: no free month.
    const { data: existing, error: existingError } = await ctx.supabaseAdmin
      .from("subscriptions")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (existingError) {
      return Response.json({ error: existingError.message }, { status: 500 });
    }
    if (existing) {
      return Response.json({ granted: false });
    }

    // Claim first, so two calls at once can't both grant.
    const { data: claimed, error: claimError } = await ctx.supabaseAdmin
      .from("free_months")
      .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true })
      .select("user_id");
    if (claimError) {
      return Response.json({ error: claimError.message }, { status: 500 });
    }
    if (!claimed?.length) {
      return Response.json({ granted: false });
    }

    const endsAtMs = Date.now() + FREE_DAYS * 24 * 60 * 60 * 1000;
    const endsAt = new Date(endsAtMs).toISOString();
    const grant = await fetch(
      `https://api.revenuecat.com/v2/projects/${encodeURIComponent(projectId)}/customers/${encodeURIComponent(userId)}/actions/grant_entitlement`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ entitlement_id: entitlementId, expires_at: endsAtMs }),
      }
    );
    if (!grant.ok) {
      // Release the claim so the next app open can try again.
      await ctx.supabaseAdmin.from("free_months").delete().eq("user_id", userId);
      const detail = await grant.text();
      console.error("RevenueCat grant failed", grant.status, detail);
      return Response.json({ error: "Couldn't start the free month." }, { status: 502 });
    }

    await ctx.supabaseAdmin.from("free_months").update({ ends_at: endsAt }).eq("user_id", userId);
    // Same server-side record every other membership gets, so the
    // subscriptions table shows who's on their free month.
    await ctx.supabaseAdmin
      .from("subscriptions")
      .upsert(
        { user_id: userId, status: "trialing", trial_ends_at: endsAt },
        { onConflict: "user_id", ignoreDuplicates: true }
      );

    return Response.json({ granted: true, endsAt });
  }),
};
