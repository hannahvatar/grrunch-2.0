// Weekly "new deals are live" email (Anabelle, 2026-11-03: so sign-ups
// don't forget about Grrunch). A pg_cron job calls this every 10 minutes
// (migrations/20261104000000_weekly_email.sql); it only sends when a week
// went live in the last 6 hours and hasn't been emailed yet
// (weekly_email_sends), so the email goes out once, right after Thursday
// 12 pm, with no weekly work for Anabelle.
//
// Content is what she already picked: the live week's Home deals
// (home_pick order) and featured recipes (best deals first, like Home).
//
// Who gets it (CASL, see the migration):
//   - email_consents.weekly_deals = true: every week;
//   - accounts made before the sign-up box existed (SIGNUP_BOX_LAUNCH),
//     within 6 months of signing up, never asked and never unsubscribed:
//     ONE email with a "Keep them coming" button, then nothing more
//     unless they click it;
//   - nobody whose master "Email" switch in Profile is off.
// Every email names the business, its mailing address and has an
// unsubscribe link plus the one-click List-Unsubscribe header.
//
// Secrets: RESEND_API_KEY, EMAIL_LINK_SECRET (_shared/emailLinks.ts),
// GRRUNCH_MAILING_ADDRESS (the CASL footer), WEEKLY_EMAIL_FROM optional.
// WEEKLY_EMAIL_LIVE=true turns on the real Thursday send (Anabelle,
// 2026-11-03: not to members yet). Until then only test previews go out.
//
// Client contract:
//   POST {}                      (cron) -> 200 { sent } or { skipped }
//   POST { test: true, ask? }    (admin, signed in) -> sends the email to
//     the caller only, without marking the week sent; ask: true previews
//     the "Keep them coming" version.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { requireAdmin } from "../_shared/admin.ts";
import { signUserId } from "../_shared/emailLinks.ts";

const APP_URL = "https://app.grrunch.com";
const FUNCTIONS_URL = "https://vzuugbiqbzritdystnar.supabase.co/functions/v1";
const DEFAULT_FROM = "Grrunch <support@grrunch.com>";
const BUSINESS_NAME = "Grrunch, 17216891 Canada Inc.";
// Accounts made before this never saw the sign-up box.
const SIGNUP_BOX_LAUNCH = "2026-11-04T00:00:00Z";
const IMPLIED_CONSENT_DAYS = 183;
const SEND_WINDOW_HOURS = 6;
const DEALS_SHOWN = 6;
const RECIPES_SHOWN = 6;
// Anabelle's own test inboxes. They only get it if they're admins.
const TEST_EMAIL = /@grrunch\.(com|local)$|@extradesigners\.com$|^anabelle\.dubois\+/i;

// Recipe photos are ~350 KB at 1200 px; mail apps (iCloud's image proxy
// especially) sometimes give up on those, so the email asks Supabase for a
// 600 px copy (~50 KB). resize=contain keeps the whole photo: without it
// Supabase keeps the full height and crops the width. Other hosts' images
// are left as they are.
function emailPhoto(url: string): string {
  const original = "/storage/v1/object/public/";
  if (!url.includes(original)) return url;
  return `${url.replace(original, "/storage/v1/render/image/public/")}?width=600&resize=contain&quality=75`;
}

const ACCENT = "#FFA955";
const INK = "#111111";
const MUTED = "#767676";
const CREAM = "#FFF5EB";

interface Deal {
  item_name: string;
  chain_name: string;
  price: number | null;
  discount_pct: number | null;
  original_price_source: string | null;
  price_unit: string | null;
  package_weight_g: number | null;
  package_volume_ml: number | null;
  package_size_unit: string | null;
  bundle_count: number | null;
  image_url: string | null;
  home_pick: number | null;
}

interface DealTag {
  discount_pct?: number;
  original_price_source?: string;
}

interface Recipe {
  id: string;
  name: string;
  descriptor: string | null;
  price: number | null;
  minutes: number | null;
  servings: number;
  image_url: string | null;
  deal_tags: DealTag[] | null;
}

interface Consent {
  user_id: string;
  weekly_deals: boolean;
  asked_at: string | null;
  unsubscribed_at: string | null;
}

interface Recipient {
  userId: string;
  email: string;
  firstName: string | null;
  ask: boolean;
}

// deno-lint-ignore no-explicit-any
type Db = any;

// Same unit reading as the app's priceUnitSuffix (lib/curatedDeals.ts):
// the stored price with the unit set in dev-deals, never converted.
function priceUnitSuffix(deal: Deal): string {
  if (deal.bundle_count && deal.bundle_count > 1) return `&nbsp;for&nbsp;${deal.bundle_count}`;
  if (deal.price_unit === "each") return "&nbsp;each";
  if (deal.price_unit === "lb") return "/lb";
  if (deal.price_unit === "kg") return "/kg";
  if (deal.price_unit === "100g") return "/100&nbsp;g";
  const trim = (v: number) => String(Math.round(v * 100) / 100);
  // The size unit the flyer prints, when known ("/5 lb").
  if (deal.package_weight_g) {
    if (deal.package_size_unit === "lb") return `/${trim(deal.package_weight_g / 453.592)}&nbsp;lb`;
    if (deal.package_size_unit === "g") return `/${Math.round(deal.package_weight_g)}&nbsp;g`;
    if (deal.package_size_unit === "kg") return `/${trim(deal.package_weight_g / 1000)}&nbsp;kg`;
    return deal.package_weight_g >= 1000
      ? `/${trim(deal.package_weight_g / 1000)}&nbsp;kg`
      : `/${Math.round(deal.package_weight_g)}&nbsp;g`;
  }
  if (deal.package_volume_ml) {
    if (deal.package_size_unit === "ml") return `/${Math.round(deal.package_volume_ml)}&nbsp;ml`;
    if (deal.package_size_unit === "L") return `/${trim(deal.package_volume_ml / 1000)}&nbsp;L`;
    return deal.package_volume_ml >= 1000
      ? `/${trim(deal.package_volume_ml / 1000)}&nbsp;L`
      : `/${Math.round(deal.package_volume_ml)}&nbsp;ml`;
  }
  return "/pkg";
}

// Same badges as the app: "Up to N% off" for a store markdown, "Up to N%
// below" against a reference price, nothing under 5%.
function discountLabel(pct: number | null, source: string | null): string | null {
  if (!pct || pct < 5) return null;
  return source === "reference" ? `Up to ${Math.round(pct)}% below` : `Up to ${Math.round(pct)}% off`;
}

// Home's own order (sortMealsByBestDeal): average real store markdown.
function avgRealSavings(recipe: Recipe): number {
  const real = (recipe.deal_tags ?? []).filter((t) => t.original_price_source !== "reference");
  if (real.length === 0) return 0;
  return real.reduce((sum, t) => sum + (t.discount_pct ?? 0), 0) / real.length;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatWeek(from: string, to: string): string {
  const fmt = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${fmt(from)} to ${fmt(to)}`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${ACCENT};color:${INK};border:2px solid ${INK};border-radius:24px;padding:12px 28px;font-weight:700;font-size:16px;text-decoration:none;">${label}</a>`;
}

function dealCell(deal: Deal): string {
  const label = discountLabel(deal.discount_pct, deal.original_price_source);
  return `<td width="50%" valign="top" style="padding:6px;">
    <div style="background:#ffffff;border:2px solid ${INK};border-radius:14px;padding:12px;">
      ${deal.image_url ? `<img src="${deal.image_url}" alt="" width="100%" style="display:block;width:100%;max-height:140px;object-fit:contain;border-radius:8px;margin-bottom:8px;">` : ""}
      ${label ? `<div style="display:inline-block;background:#EDE7FF;color:#5B3FD6;border-radius:12px;padding:2px 10px;font-size:13px;font-weight:700;margin-bottom:6px;">${label}</div>` : ""}
      <div style="font-size:15px;font-weight:700;color:${INK};">${escapeHtml(deal.item_name)}</div>
      <div style="font-size:13px;color:${MUTED};margin:2px 0 6px;">${escapeHtml(deal.chain_name)}</div>
      <div style="font-size:17px;font-weight:800;color:${INK};">$${(deal.price ?? 0).toFixed(2)}${priceUnitSuffix(deal)}</div>
    </div>
  </td>`;
}

function recipeBlock(recipe: Recipe): string {
  const href = `${APP_URL}/recipe?id=${encodeURIComponent(recipe.id)}`;
  const meta = [recipe.minutes ? `${recipe.minutes} min` : null, `${recipe.servings} servings`].filter(Boolean).join(" · ");
  return `<tr><td style="padding:8px 0;">
    <a href="${href}" style="text-decoration:none;color:${INK};">
      <div style="background:#ffffff;border:2px solid ${INK};border-radius:14px;overflow:hidden;">
        ${recipe.image_url ? `<img src="${emailPhoto(recipe.image_url)}" alt="" width="100%" style="display:block;width:100%;max-height:260px;object-fit:cover;">` : ""}
        <div style="padding:14px 16px;">
          <div style="font-size:18px;font-weight:800;">${escapeHtml(recipe.name)}</div>
          ${recipe.descriptor ? `<div style="font-size:15px;color:${INK};margin:4px 0 8px;">${escapeHtml(recipe.descriptor)}</div>` : ""}
          <div style="font-size:15px;"><strong style="font-size:20px;">$${(recipe.price ?? 0).toFixed(2)}</strong> / serving <span style="color:${MUTED};">· ${meta}</span></div>
        </div>
      </div>
    </a>
  </td></tr>`;
}

function buildEmail(opts: {
  weekLabel: string;
  firstName: string | null;
  deals: Deal[];
  recipes: Recipe[];
  ask: boolean;
  keepUrl: string;
  unsubscribeUrl: string;
  mailingAddress: string;
}): { html: string; text: string } {
  const hello = opts.firstName ? `Hi ${escapeHtml(opts.firstName)}!` : "Hi there!";
  const dealRows: string[] = [];
  for (let i = 0; i < opts.deals.length; i += 2) {
    dealRows.push(`<tr>${dealCell(opts.deals[i])}${opts.deals[i + 1] ? dealCell(opts.deals[i + 1]) : '<td width="50%"></td>'}</tr>`);
  }
  const askBlock = opts.ask
    ? `<tr><td style="padding:8px 0 24px;">
        <div style="background:#ffffff;border:2px dashed ${INK};border-radius:14px;padding:18px;text-align:center;">
          <div style="font-size:18px;font-weight:800;margin-bottom:6px;">Want these every Thursday?</div>
          <div style="font-size:15px;margin-bottom:14px;">We'll only keep sending them if you say yes.</div>
          ${button(opts.keepUrl, "Keep them coming")}
        </div>
      </td></tr>`
    : "";

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>This week at Grrunch</title></head>
<body style="margin:0;padding:0;background:${CREAM};font-family:'Open Sans',Arial,Helvetica,sans-serif;color:${INK};">
<div style="display:none;max-height:0;overflow:hidden;">This week's grocery deals from BC stores, and recipes that make the most of them.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
  <tr><td style="padding-bottom:16px;font-size:22px;font-weight:800;letter-spacing:1px;">GRRUNCH</td></tr>
  <tr><td style="padding-bottom:4px;font-size:16px;">${hello}</td></tr>
  <tr><td style="padding-bottom:8px;font-size:26px;font-weight:800;line-height:1.2;">This week's deals are live</td></tr>
  <tr><td style="padding-bottom:20px;font-size:16px;line-height:1.5;">We hunted down this week's grocery bargains and cooked up delicious ways to make the most of them. Valid ${opts.weekLabel}.</td></tr>
  ${askBlock}
  ${opts.recipes.length ? `<tr><td style="padding:4px 0;font-size:20px;font-weight:800;">Recipes that make cents</td></tr>${opts.recipes.map(recipeBlock).join("")}` : ""}
  ${opts.deals.length ? `<tr><td style="padding:20px 0 4px;font-size:20px;font-weight:800;">The deals we dig</td></tr>
  <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${dealRows.join("")}</table></td></tr>` : ""}
  <tr><td align="center" style="padding:24px 0;">${button(APP_URL, "Open Grrunch")}</td></tr>
  <tr><td style="padding-top:16px;border-top:1px solid #e5d6c6;font-size:13px;line-height:1.6;color:${MUTED};">
    You're getting this because you have a Grrunch account. Prices are from store flyers and may change.<br>
    ${BUSINESS_NAME} · ${escapeHtml(opts.mailingAddress)} · <a href="mailto:support@grrunch.com" style="color:${MUTED};">support@grrunch.com</a><br>
    <a href="${opts.unsubscribeUrl}" style="color:${MUTED};">Unsubscribe from weekly emails</a>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    opts.firstName ? `Hi ${opts.firstName}!` : "Hi there!",
    "",
    "This week's deals are live.",
    `We hunted down this week's grocery bargains and cooked up delicious ways to make the most of them. Valid ${opts.weekLabel}.`,
    "",
    ...(opts.ask ? ["Want these every Thursday? We'll only keep sending them if you say yes:", opts.keepUrl, ""] : []),
    ...(opts.recipes.length ? ["Recipes that make cents:"] : []),
    ...opts.recipes.map((r) => `- ${r.name}: $${(r.price ?? 0).toFixed(2)} / serving. ${APP_URL}/recipe?id=${r.id}`),
    "",
    ...(opts.deals.length ? ["The deals we dig:"] : []),
    ...opts.deals.map(
      (d) => `- ${d.item_name}, ${d.chain_name}: $${(d.price ?? 0).toFixed(2)}${priceUnitSuffix(d).replace(/&nbsp;/g, " ")}`
    ),
    "",
    `Open Grrunch: ${APP_URL}`,
    "",
    `${BUSINESS_NAME}, ${opts.mailingAddress}, support@grrunch.com`,
    `Unsubscribe from weekly emails: ${opts.unsubscribeUrl}`,
  ].join("\n");

  return { html, text };
}

async function loadContent(db: Db): Promise<{ deals: Deal[]; recipes: Recipe[] }> {
  const dealColumns =
    "item_name, chain_name, price, discount_pct, original_price_source, price_unit, package_weight_g, package_volume_ml, package_size_unit, bundle_count, image_url, home_pick";
  const { data: picked, error: dealError } = await db
    .from("curated_deals")
    .select(dealColumns)
    .eq("published", true)
    .eq("status", "approved")
    .not("home_pick", "is", null)
    .is("zone", null)
    .order("home_pick")
    .limit(DEALS_SHOWN);
  if (dealError) throw new Error(dealError.message);
  let deals = (picked ?? []) as Deal[];
  // No Home picks this week: the biggest savings, like Home's empty slots.
  if (deals.length === 0) {
    const { data: top } = await db
      .from("curated_deals")
      .select(dealColumns)
      .eq("published", true)
      .eq("status", "approved")
      .is("zone", null)
      .not("price", "is", null)
      .order("discount_pct", { ascending: false })
      .limit(DEALS_SHOWN);
    deals = (top ?? []) as Deal[];
  }

  const { data: featured, error: recipeError } = await db
    .from("recipes")
    .select("id, name, descriptor, price, minutes, servings, image_url, deal_tags")
    .eq("featured", true);
  if (recipeError) throw new Error(recipeError.message);
  const recipes = ((featured ?? []) as Recipe[])
    .sort((a, b) => avgRealSavings(b) - avgRealSavings(a))
    .slice(0, RECIPES_SHOWN);
  return { deals, recipes };
}

async function loadRecipients(db: Db): Promise<Recipient[]> {
  const users: { id: string; email?: string; created_at: string }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  const [{ data: consents }, { data: profiles }, { data: admins }] = await Promise.all([
    db.from("email_consents").select("user_id, weekly_deals, asked_at, unsubscribed_at"),
    db.from("users").select("id, first_name, notification_prefs"),
    db.from("admins").select("user_id"),
  ]);
  const consentById = new Map<string, Consent>(((consents ?? []) as Consent[]).map((c) => [c.user_id, c]));
  const profileById = new Map<string, { first_name: string | null; notification_prefs: { emailSubscribed?: boolean } | null }>(
    (profiles ?? []).map((p: { id: string }) => [p.id, p])
  );
  const adminIds = new Set(((admins ?? []) as { user_id: string }[]).map((a) => a.user_id));
  const impliedSince = Date.now() - IMPLIED_CONSENT_DAYS * 24 * 60 * 60 * 1000;

  const recipients: Recipient[] = [];
  for (const user of users) {
    if (!user.email) continue;
    if (TEST_EMAIL.test(user.email) && !adminIds.has(user.id)) continue;
    const profile = profileById.get(user.id);
    if (profile?.notification_prefs?.emailSubscribed === false) continue;
    const consent = consentById.get(user.id);
    if (consent?.weekly_deals) {
      recipients.push({ userId: user.id, email: user.email, firstName: profile?.first_name ?? null, ask: false });
      continue;
    }
    const created = Date.parse(user.created_at);
    const canAsk =
      !consent?.asked_at && !consent?.unsubscribed_at && created < Date.parse(SIGNUP_BOX_LAUNCH) && created > impliedSince;
    if (canAsk) {
      recipients.push({ userId: user.id, email: user.email, firstName: profile?.first_name ?? null, ask: true });
    }
  }
  return recipients;
}

async function sendBatch(
  apiKey: string,
  emails: Record<string, unknown>[]
): Promise<{ ok: boolean; detail?: string }> {
  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(emails),
  });
  if (res.ok) return { ok: true };
  return { ok: false, detail: `${res.status} ${await res.text()}` };
}

async function emailFor(
  recipient: Recipient,
  shared: { weekLabel: string; deals: Deal[]; recipes: Recipe[]; mailingAddress: string; from: string }
): Promise<Record<string, unknown>> {
  const u = encodeURIComponent(recipient.userId);
  const t = await signUserId(recipient.userId);
  const keepUrl = `${APP_URL}/email-preferences?a=keep&u=${u}&t=${t}`;
  const unsubscribeUrl = `${APP_URL}/email-preferences?a=stop&u=${u}&t=${t}`;
  const { html, text } = buildEmail({
    weekLabel: shared.weekLabel,
    firstName: recipient.firstName,
    deals: shared.deals,
    recipes: shared.recipes,
    ask: recipient.ask,
    keepUrl,
    unsubscribeUrl,
    mailingAddress: shared.mailingAddress,
  });
  return {
    from: shared.from,
    to: [recipient.email],
    subject: `This week's deals are live, ${shared.weekLabel}`,
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${FUNCTIONS_URL}/weekly-email-preferences?a=stop&u=${u}&t=${t}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req, ctx) => {
    const db: Db = ctx.supabaseAdmin;
    let body: { test?: unknown; ask?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      // The cron call has an empty body.
    }
    const test = body.test === true;

    const apiKey = Deno.env.get("RESEND_API_KEY");
    const mailingAddress = Deno.env.get("GRRUNCH_MAILING_ADDRESS");
    const from = Deno.env.get("WEEKLY_EMAIL_FROM") ?? DEFAULT_FROM;
    if (!apiKey || !mailingAddress || !Deno.env.get("EMAIL_LINK_SECRET")) {
      return Response.json({ error: "Weekly email isn't set up yet." }, { status: 500 });
    }

    const { data: week, error: weekError } = await db
      .from("published_week")
      .select("flyer_valid_from, flyer_valid_to, published_at")
      .eq("id", 1)
      .maybeSingle();
    if (weekError) return Response.json({ error: weekError.message }, { status: 500 });
    if (!week) return Response.json({ skipped: "No week is live." });
    const weekLabel = formatWeek(week.flyer_valid_from, week.flyer_valid_to);

    if (test) {
      const denied = await requireAdmin(req, db);
      if (denied) return denied;
      const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
      const { data: userData } = await db.auth.getUser(token);
      const user = userData?.user;
      if (!user?.email) return Response.json({ error: "Your account has no email address." }, { status: 400 });
      const { data: profile } = await db.from("users").select("first_name").eq("id", user.id).maybeSingle();
      const content = await loadContent(db);
      const email = await emailFor(
        { userId: user.id, email: user.email, firstName: profile?.first_name ?? null, ask: body.ask === true },
        { weekLabel, mailingAddress, from, ...content }
      );
      const result = await sendBatch(apiKey, [email]);
      if (!result.ok) return Response.json({ error: result.detail }, { status: 502 });
      return Response.json({ sent: 1, to: user.email });
    }

    if (Deno.env.get("WEEKLY_EMAIL_LIVE") !== "true") {
      return Response.json({ skipped: "The weekly email is off (WEEKLY_EMAIL_LIVE)." });
    }
    if (Date.now() - Date.parse(week.published_at) > SEND_WINDOW_HOURS * 60 * 60 * 1000) {
      return Response.json({ skipped: "This week went live too long ago." });
    }
    // Claim the week first, so overlapping runs can't both send.
    const { data: claimed, error: claimError } = await db
      .from("weekly_email_sends")
      .upsert({ flyer_valid_from: week.flyer_valid_from }, { onConflict: "flyer_valid_from", ignoreDuplicates: true })
      .select("flyer_valid_from");
    if (claimError) return Response.json({ error: claimError.message }, { status: 500 });
    if (!claimed?.length) return Response.json({ skipped: "Already sent this week." });

    let sent = 0;
    let failure: string | null = null;
    try {
      const content = await loadContent(db);
      const recipients = await loadRecipients(db);
      // Resend takes up to 100 emails per batch call.
      for (let i = 0; i < recipients.length; i += 100) {
        const chunk = recipients.slice(i, i + 100);
        const emails = await Promise.all(chunk.map((r) => emailFor(r, { weekLabel, mailingAddress, from, ...content })));
        const result = await sendBatch(apiKey, emails);
        if (!result.ok) {
          failure = result.detail ?? "Send failed.";
          break;
        }
        sent += chunk.length;
        const askedIds = chunk.filter((r) => r.ask).map((r) => r.userId);
        if (askedIds.length) {
          const now = new Date().toISOString();
          await db
            .from("email_consents")
            .upsert(
              askedIds.map((id) => ({ user_id: id, asked_at: now, updated_at: now })),
              { onConflict: "user_id" }
            );
        }
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }

    await db
      .from("weekly_email_sends")
      .update({ finished_at: new Date().toISOString(), sent_count: sent, error: failure })
      .eq("flyer_valid_from", week.flyer_valid_from);
    if (failure) {
      console.error("Weekly email failed", failure);
      return Response.json({ error: failure, sent }, { status: 502 });
    }
    return Response.json({ sent });
  }),
};
