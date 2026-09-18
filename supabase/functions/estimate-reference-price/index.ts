// AI-estimated reference price for app/app/dev-deals.tsx, for a deal
// StatCan has no comparable item for. Anabelle, 2026-09-18, on "Fresh
// Extra Lean Ground Beef": StatCan only has plain "Ground beef", and
// "lean meat usually is way more expensive" -- "If statcan doesnt have a
// reference i think i want to be able to input an ai one". She picked a
// button that asks Claude (over typing in a number she got elsewhere),
// and chose to treat the result exactly like a StatCan reference once
// she approves it (original_price_source='reference', same shopper tags).
//
// Same methodology as StatCan's own reference prices (table 18-10-0245-01,
// monthly AVERAGE retail prices across stores, British Columbia -- the
// same province scripts/sync_statcan_prices.py pulls): a BC-wide average
// across chains and months, never one store's shelf tag. Anabelle: "it
// looks like the AI estimate runs only for this store only. I would like
// the Gen AI estimate to have similar methodology than StatCan, meaning
// having a broader view on extra lean ground beef usually in canada".
// The first version was told the store ("Safeway") and answered with a
// single-store guess. BC rather than Canada so AI and StatCan references
// line up (Anabelle: "ok lets do BC average then"). The prompt used to
// give regular ground beef as a worked example, which Claude then quoted
// as its basis -- "now it compares to the wrong item" -- so it only ever
// prices the item named. The item wording itself is editable in
// dev-deals.tsx before asking.
//
// Client contract:
//   POST { item_name: string }
//   -> 200 { price: number, quantity: number, unit: "g"|"kg"|"ml"|"L"|"lb"|"each",
//            reasoning: string }
//   -> 4xx/5xx { error: string }
//
// Deliberately NOT given the deal's own sale price -- the estimate is a
// regular shelf price to compare the sale against, and showing the model
// the number it's being compared to would anchor it.
//
// Needs the ANTHROPIC_API_KEY secret (`supabase secrets set`), same as
// GOOGLE_PLACES_API_KEY for nearest-stores. Like every Edge Function
// here, it's callable with the app's publishable key, so each call is a
// paid Claude request -- item_name is length-capped and max_tokens kept
// small to bound what one call can cost.
import "@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "@anthropic-ai/sdk";
import { withSupabase } from "@supabase/server";

const UNITS = ["g", "kg", "ml", "L", "lb", "each"] as const;
type EstimateUnit = (typeof UNITS)[number];

interface Estimate {
  price: number;
  quantity: number;
  unit: EstimateUnit;
  reasoning: string;
}

const ESTIMATE_SCHEMA = {
  type: "object",
  properties: {
    price: { type: "number", description: "Typical regular (non-sale) price in Canadian dollars." },
    quantity: { type: "number", description: "The amount that price is for, in `unit`." },
    unit: { type: "string", enum: [...UNITS] },
    reasoning: {
      type: "string",
      description: "One or two short sentences on what the estimate is based on.",
    },
  },
  required: ["price", "quantity", "unit", "reasoning"],
  additionalProperties: false,
};

const SYSTEM = `You estimate reference grocery prices for a Canadian price-comparison app, using the same methodology as Statistics Canada's "Monthly average retail prices for selected products" (table 18-10-0245-01) for British Columbia.
Given a grocery item as it appears in a store flyer, answer with its AVERAGE RETAIL PRICE IN BRITISH COLUMBIA in 2026: the typical price across all major grocery chains in BC and across the year, not any one store's shelf price and not a one-off sale price.
Price exactly the item named, as worded -- its cut, grade, leanness, brand tier, organic status and form all matter. Never substitute a more common or more generic product for it.
Price fresh meat, produce, cheese and other items sold by weight per kg, as StatCan does; price packaged goods for the package size the item names (or its most common size). Use "each" only for items sold by the unit.
Keep reasoning to one or two short sentences about this item's own BC-wide average price; don't compare it to other products.`;

function validationError(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req) => {
    let body: { item_name?: unknown };
    try {
      body = await req.json();
    } catch {
      return validationError("Request body must be valid JSON.");
    }

    const itemName = typeof body.item_name === "string" ? body.item_name.trim() : "";
    if (itemName === "" || itemName.length > 200) {
      return validationError("item_name is required (200 characters max).");
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY isn't set for Edge Functions -- run `supabase secrets set ANTHROPIC_API_KEY=...`." },
        { status: 500 },
      );
    }
    const client = new Anthropic({ apiKey });

    let response;
    try {
      response = await client.beta.messages.create({
        model: "claude-opus-5",
        max_tokens: 4000,
        // A refusal on a grocery price is unlikely, but if one happens the
        // API re-runs the request on Anthropic's recommended fallback
        // model instead of returning nothing.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema: ESTIMATE_SCHEMA },
        },
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `Item: ${itemName}`,
          },
        ],
      });
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        return Response.json({ error: "Claude is rate-limited right now -- try again in a minute." }, { status: 429 });
      }
      if (error instanceof Anthropic.APIError) {
        return Response.json({ error: `Claude API error ${error.status}: ${error.message}` }, { status: 502 });
      }
      return Response.json({ error: "Couldn't reach Claude." }, { status: 502 });
    }

    if (response.stop_reason === "refusal") {
      return Response.json({ error: "Claude declined to estimate this item." }, { status: 502 });
    }
    const text = response.content.find((block) => block.type === "text");
    if (!text || text.type !== "text") {
      return Response.json({ error: "Claude returned no estimate." }, { status: 502 });
    }

    let estimate: Estimate;
    try {
      estimate = JSON.parse(text.text) as Estimate;
    } catch {
      return Response.json({ error: "Claude's estimate wasn't valid JSON." }, { status: 502 });
    }
    if (!(estimate.price > 0) || !(estimate.quantity > 0) || !UNITS.includes(estimate.unit)) {
      return Response.json({ error: "Claude's estimate was incomplete." }, { status: 502 });
    }

    return Response.json(estimate);
  }),
};
