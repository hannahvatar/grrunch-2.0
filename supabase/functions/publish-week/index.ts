// "Publish week" for app/app/dev-deals.tsx. Since 2026-09-24 (Anabelle's
// weekly rhythm: close Thursday 11:59 pm, empty state Friday, new week
// Saturday 12:00 am, Vancouver time) the button SCHEDULES the reviewed
// draft week instead of swapping it in instantly:
//
//   - public.schedule_publish_week() queues it for the Saturday 12:00 am
//     after the live week closes, or publishes right away if that moment
//     has already passed (a late publish during the empty state);
//   - a pg_cron job (run_scheduled_publish, every 5 min) does the actual
//     swap at that time -- public.publish_week(), unchanged in spirit:
//     delete the live week, promote the draft, record the week in
//     published_week (now with its closes_at), make recipes.featured_next
//     live, re-price recipes.
//
// See supabase/migrations/20260924010000_weekly_cutoff_schedule.sql.
// Those functions are service-role only, so shoppers can't call them
// through the public REST API.
//
// Client contract:
//   POST { action?: "schedule" }  -> 200 { published_now, scheduled_for }
//   POST { action: "cancel" }     -> 200 { cancelled: true }
//   400 { error } when the draft has no approved deals yet
//
// Same auth pattern as duplicate-curated-deal: reachable with the
// publishable key, and the calling screen is __DEV__-only.
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

interface ScheduleResult {
  published_now: boolean;
  scheduled_for: string | null;
}

interface Database {
  __InternalSupabase: { PostgrestVersion: string };
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      schedule_publish_week: { Args: Record<string, never>; Returns: ScheduleResult[] };
      cancel_scheduled_publish: { Args: Record<string, never>; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export default {
  fetch: withSupabase<Database>({ auth: ["publishable"] }, async (req, ctx) => {
    let action = "schedule";
    try {
      const body = await req.json();
      if (body?.action === "cancel") action = "cancel";
    } catch {
      // Empty body = schedule, same as the old no-body call.
    }

    if (action === "cancel") {
      const { error } = await ctx.supabaseAdmin.rpc("cancel_scheduled_publish");
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ cancelled: true });
    }

    const { data, error } = await ctx.supabaseAdmin.rpc("schedule_publish_week");
    if (error) {
      // Raised by the function itself when the draft isn't ready --
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
