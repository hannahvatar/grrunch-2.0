// "Publish week" for app/app/dev-deals.tsx (Anabelle, 2026-09-18): swaps
// the reviewed DRAFT week in as the live week shoppers see, all at once --
// deals, recipe prices/badges and the featured recipe set -- instead of
// each approval going live the instant it's saved. By hand for now;
// automatic later.
//
// All the work is public.publish_week() (supabase/migrations/
// 20260918010000_weekly_publish.sql), one transaction: delete the live
// week, promote the draft, record the week's flyer dates in
// published_week, make recipes.featured_next the live set, re-price
// recipes. That function is service-role only, so shoppers can't call it
// through the public REST API.
//
// Client contract:
//   POST {} -> 200 { deals_published, deals_still_pending, recipes_featured,
//                    week_from, week_to }
//           -> 400 { error } when the draft has no approved deals yet
//
// Same auth pattern as duplicate-curated-deal: reachable with the
// publishable key, and the calling screen is __DEV__-only.
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

interface PublishResult {
  deals_published: number;
  deals_still_pending: number;
  recipes_featured: number;
  week_from: string;
  week_to: string;
}

interface Database {
  __InternalSupabase: { PostgrestVersion: string };
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      publish_week: { Args: Record<string, never>; Returns: PublishResult[] };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export default {
  fetch: withSupabase<Database>({ auth: ["publishable"] }, async (_req, ctx) => {
    const { data, error } = await ctx.supabaseAdmin.rpc("publish_week");

    if (error) {
      // publish_week() raises this itself when the draft isn't ready --
      // a reviewer-facing message, not a server fault.
      const notReady = error.message.includes("nothing to publish");
      return Response.json({ error: error.message }, { status: notReady ? 400 : 500 });
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result) {
      return Response.json({ error: "Publish returned no result." }, { status: 500 });
    }
    return Response.json(result);
  }),
};
