// Toggles one recipe's `featured` flag -- see supabase/migrations/
// 20260911020000_recipes_featured_flag.sql for what it means and why.
// Built for app/app/dev-recipes.tsx (the __DEV__-only recipe review
// screen, same one Anabelle already uses to check how a recipe looks
// in the app), so she can mark this week's ~12 featured recipes by
// hand instead of Meals showing every deal-tagged recipe uncapped.
//
// recipes has no INSERT/UPDATE RLS policy for the anon key at all
// (only "recipes are publicly readable", select-only) -- same reason
// every other dev-screen write in this project (update-curated-deal-
// pricing, duplicate-curated-deal) goes through a service-role Edge
// Function instead of a direct client .update(). Same accepted-risk
// precedent as those: reachable via the public anon key, but the
// calling screen is __DEV__-gated and inert in any shipped build, and
// the worst case here is toggling a display flag on an existing row,
// not touching pricing, financial, or user data.
//
// Client contract:
//   POST { recipe_id: string (uuid), featured: boolean }
//   -> 200 { id: string, featured: boolean }

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

interface Database {
  __InternalSupabase: { PostgrestVersion: string };
  public: {
    Tables: {
      recipes: {
        Row: { id: string; featured: boolean };
        Insert: never;
        Update: { featured?: boolean };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

interface RequestBody {
  recipe_id?: unknown;
  featured?: unknown;
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

    const { recipe_id, featured } = body;

    if (typeof recipe_id !== "string" || recipe_id.length === 0) {
      return validationError("recipe_id is required.");
    }
    if (typeof featured !== "boolean") {
      return validationError("featured must be a boolean.");
    }

    // ctx.supabaseAdmin bypasses RLS -- see the header comment above for
    // why that's needed here.
    const { data: updated, error } = await ctx.supabaseAdmin
      .from("recipes")
      .update({ featured })
      .eq("id", recipe_id)
      .select("id, featured")
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json(updated);
  }),
};

/* To invoke locally:

  1. Run `supabase start` then `supabase functions serve`
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/toggle-recipe-featured' \
    --header 'apiKey: <anon key>' \
    --header 'Content-Type: application/json' \
    --data '{
      "recipe_id": "00000000-0000-0000-0000-000000000000",
      "featured": true
    }'

*/
