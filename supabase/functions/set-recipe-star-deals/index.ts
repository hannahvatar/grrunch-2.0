// Sets one recipe's star_deals -- the up-to-3 deal ingredients its Home
// card features (see supabase/migrations/20261023010000_recipe_star_deals
// .sql). Built for app/app/dev-recipes.tsx, same pattern and same
// accepted-risk reasoning as toggle-recipe-featured: recipes has no
// client-writable RLS policy, so the write goes through the service role;
// the calling screen is __DEV__-gated, and the worst case is changing
// which deals a Home card highlights.
//
// Client contract:
//   POST { recipe_id: string (uuid), star_deals: string[] (max 3) }
//   -> 200 { id, star_deals }

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

interface Database {
  __InternalSupabase: { PostgrestVersion: string };
  public: {
    Tables: {
      recipes: {
        Row: { id: string; star_deals: string[] };
        Insert: never;
        Update: { star_deals?: string[] };
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
    let body: { recipe_id?: unknown; star_deals?: unknown };
    try {
      body = await req.json();
    } catch {
      return validationError("Request body must be valid JSON.");
    }

    const { recipe_id, star_deals } = body;
    if (typeof recipe_id !== "string" || recipe_id.length === 0) {
      return validationError("recipe_id is required.");
    }
    if (!Array.isArray(star_deals) || !star_deals.every((name) => typeof name === "string" && name.length > 0)) {
      return validationError("star_deals must be an array of ingredient names.");
    }
    if (star_deals.length > 3) {
      return validationError("Pick at most 3 star deals.");
    }

    const { data: updated, error } = await ctx.supabaseAdmin
      .from("recipes")
      .update({ star_deals })
      .eq("id", recipe_id)
      .select("id, star_deals")
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json(updated);
  }),
};
