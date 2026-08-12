// Keeps public.subscriptions in sync with real RevenueCat purchase
// events (in-app purchases via Apple/Google -- see this session's
// Stripe-vs-IAP decision, no Stripe involved at all). RevenueCat is
// configured to call this URL on every entitlement-affecting event;
// this function is the only writer of a *real* (non-trial) status --
// the app's own startTrial() (lib/subscription.tsx) still writes the
// DB-only 30-day trial row directly, used only as a fallback for as
// long as RevenueCat isn't configured client-side yet (see
// lib/purchases.tsx's `configured` flag).
//
// app_user_id <-> subscriptions.user_id mapping: lib/purchases.tsx
// calls Purchases.logIn(session.user.id) as soon as a real (non-guest)
// session exists, so RevenueCat's app_user_id IS the Supabase auth
// user id directly -- no separate lookup table needed.
//
// Auth: this is a server-to-server webhook, not a client call, so it
// can't use the anon/publishable-key pattern every other Edge Function
// here uses (see update-curated-deal-pricing/index.ts's comment) --
// RevenueCat has no Supabase key to send. Instead: auth: 'none' (still
// gets ctx.supabaseAdmin + CORS handling) + a manual check of the
// Authorization header against REVENUECAT_WEBHOOK_SECRET, a value you
// set once in both the RevenueCat dashboard (Project Settings ->
// Integrations -> Webhooks -> Authorization header) and this function's
// own secrets (`supabase secrets set REVENUECAT_WEBHOOK_SECRET=...`).
// Never trust an unauthenticated POST to write subscription state.
//
// Event handling is deliberately conservative for a v1: only events
// that clearly grant or clearly end access are acted on.
// - INITIAL_PURCHASE / RENEWAL / UNCANCELLATION / PRODUCT_CHANGE ->
//   upsert 'trialing' (period_type === 'TRIAL') or 'active', with the
//   real expires_at/product_id from the event.
// - EXPIRATION -> status='expired'.
// - CANCELLATION (auto-renew turned off, but still entitled until
//   expires_at) and BILLING_ISSUE (payment failed, grace period may
//   still apply) are intentionally NOT acted on yet -- acting on them
//   without also handling RevenueCat's grace-period/billing-retry
//   nuance would risk cutting someone off who's still actually
//   entitled. Revisit once this is live and those cases actually need
//   handling.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

interface Database {
  __InternalSupabase: { PostgrestVersion: string };
  public: {
    Tables: {
      subscriptions: {
        Row: {
          user_id: string;
          status: string;
          trial_ends_at: string | null;
          expires_at: string | null;
          product_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          status: string;
          trial_ends_at?: string | null;
          expires_at?: string | null;
          product_id?: string | null;
          updated_at?: string;
        };
        Update: {
          status?: string;
          expires_at?: string | null;
          product_id?: string | null;
          updated_at?: string;
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

const GRANTS_ACCESS = new Set(["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE"]);
const ENDS_ACCESS = new Set(["EXPIRATION"]);

interface RevenueCatEvent {
  type?: string;
  app_user_id?: string;
  product_id?: string;
  expiration_at_ms?: number;
  period_type?: string;
}

export default {
  fetch: withSupabase<Database>({ auth: ["none"] }, async (req, ctx) => {
    const expectedSecret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
    const givenSecret = req.headers.get("Authorization");
    if (!expectedSecret || givenSecret !== expectedSecret) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    let body: { event?: RevenueCatEvent };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }

    const event = body.event;
    const appUserId = event?.app_user_id;
    const type = event?.type;
    if (!appUserId || !type) {
      return Response.json({ error: "event.app_user_id and event.type are required." }, { status: 400 });
    }

    if (GRANTS_ACCESS.has(type)) {
      const status = event?.period_type === "TRIAL" ? "trialing" : "active";
      const expiresAt = event?.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null;
      const { error } = await ctx.supabaseAdmin
        .from("subscriptions")
        .upsert(
          {
            user_id: appUserId,
            status,
            expires_at: expiresAt,
            product_id: event?.product_id ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
      if (error) {
        return Response.json({ error: error.message }, { status: 500 });
      }
    } else if (ENDS_ACCESS.has(type)) {
      const { error } = await ctx.supabaseAdmin
        .from("subscriptions")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("user_id", appUserId);
      if (error) {
        return Response.json({ error: error.message }, { status: 500 });
      }
    }
    // Any other event type (CANCELLATION, BILLING_ISSUE, TRANSFER, etc.)
    // is acknowledged but intentionally not acted on yet -- see the
    // file comment above.

    return Response.json({ received: true });
  }),
};
