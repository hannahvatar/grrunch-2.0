import { ANNUAL_PRICE_DISPLAY, MONTHLY_PRICE_DISPLAY } from './purchases';

// Get support (Anabelle, 2026-08-28: live chat needs a real 3rd-party
// provider she hasn't set up yet, so this is the email-only path for now
// -- "Contact us" composes a real email via the device's own mail client
// (Linking + mailto:), no chat widget, no fake "connecting you to an
// agent" UI that doesn't actually connect to anyone).
//
// Was deliberately null (no real inbox existed yet) until grrunch.com's
// Google Workspace migration (2026-09-01/02) made support@grrunch.com a
// real, monitored alias -- now hooked up here (2026-09-08). get-support.tsx's
// "not set up yet" fallback state stays in place for the `string | null`
// type itself, in case this ever needs to go back to null.
export const SUPPORT_EMAIL: string | null = 'support@grrunch.com';

export interface FaqItem {
  question: string;
  // A plain string for copy that's always true. A function for copy that
  // depends on whether real purchases are actually live yet (see the
  // cancellation answer below) -- takes usePurchases()'s `configured` so
  // it flips to the real end-state copy the moment RevenueCat's keys are
  // set, with no FAQ edit required at launch time.
  answer: string | ((purchasesConfigured: boolean) => string);
}

// Anabelle, 2026-09-16: "write the cancellation copy as it would be once
// we are live and functional for all users" -- the real end-state
// answer, once RevenueCat is actually configured and purchase() can run.
const CANCEL_ANSWER_LIVE =
  'From your Apple or Google account’s own subscription settings — the same place any App Store/Play Store subscription is managed, since Grrunch doesn’t bill you directly.';

// Today's reality: RevenueCat's keys aren't configured yet (Apple Dev
// enrollment still pending verification), so purchase() never runs and
// "Start trial" falls back to a DB-only row (subscription.tsx) -- nothing
// in App Store/Play Store to cancel. Cancelling that trial is a real,
// already-working in-app button instead (MembershipStatus.tsx).
const CANCEL_ANSWER_PENDING =
  'Once membership goes live, from your Apple or Google account’s own subscription settings — the same place any App Store/Play Store subscription is managed, since Grrunch doesn’t bill you directly. Purchases aren’t live yet, though: right now trials are cancelled in the app instead, from Profile > Membership > Cancel trial.';

// Grounded in what's actually real about the app right now (matches
// settings-detail.tsx's About copy / how-it-works.tsx / upgrade.tsx) --
// not generic filler FAQ copy.
export const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'Do I need an account to use Grrunch?',
    answer:
      // "save recipes to your favourites, see companion recipes," dropped
      // (Anabelle, 2026-09-15: Save/Favourite and the Companion recipes
      // browse section were shelved for v1 scope, PR #222 -- "make sure
      // its not stated anywhere in the copy").
      //
      // "pick or edit your stores" corrected to "customize which stores
      // you use" (Anabelle, 2026-09-16: "the answer to the first question
      // is wrong") -- guests DO get stores picked for them (auto-selected
      // from location, confirmed unconditionally in stores.tsx, no
      // isSubscribed/isGuest gate at all); what's actually membership-only
      // is changing/customizing them afterward (Profile > My stores'
      // "Change" button, gated on isSubscribed).
      //
      // Rewritten again same day after Anabelle described her own mental
      // model of the tiers (guest = brief browse then prompted to make an
      // account; free account = the 3-recipe/1-deal tier; membership =
      // everything) -- checked it against the real gating and it's a
      // three-tier model, but not quite that one: guest and free account
      // are actually capped identically everywhere (recipe.tsx/best-
      // deals.tsx/meals.tsx all gate on isSubscribed, not isGuest) -- a
      // free account's only actual addition is account/notification
      // settings themselves. The "brief browse" instinct wasn't wrong
      // though: there IS a guest-only, one-time, skippable "create a free
      // account" nudge after viewing 3 distinct recipes (guestNudge.ts,
      // triggered from recipe.tsx's handleClose) -- surfaced here since
      // it's the real mechanic behind that instinct, just soft/skippable
      // rather than a hard wall.
      "No, you can browse as a guest, with the same limits as a free account: up to 3 of the week's recipes, 1 deal per category, no adding to your grocery list, and stores auto-selected from your location (not customizable). After you've viewed a few recipes as a guest, you'll get a one-time invite to create a free account — that's skippable, not required. A free account (still free, separate from membership) additionally lets you manage your account settings and notification preferences. Membership unlocks everything else: every recipe and deal, your grocery list, and choosing your own stores.",
  },
  {
    question: 'What does membership include?',
    // "unlimited saved recipes, companion recipes," dropped, same reason
    // as above. Price also updated from the old flat $5.99/mo (PR #224:
    // monthly $7.99 or annual $69.99).
    answer: `A 30-day free trial, then ${MONTHLY_PRICE_DISPLAY}/mo or ${ANNUAL_PRICE_DISPLAY}/yr. It unlocks all of this week's recipes (not just 3), every deal in each category (not just one), building a grocery list, and choosing your own stores instead of the ones auto-selected from your location. Cancel anytime.`,
  },
  {
    question: 'How do I cancel my trial or membership?',
    // Anabelle, 2026-09-16: "is the cancellation of trial or membership
    // answer is accurate? How do email signup member cancel?" -- payment
    // is RevenueCat/IAP-only and keys off session.user.id, so it's the
    // same regardless of auth method (email/Apple/Google sign-in all
    // alike, see purchases.tsx) -- that part was already right. What
    // wasn't: RevenueCat's API keys aren't configured yet (Apple Dev
    // enrollment still pending verification), so purchase() never runs
    // right now -- "Start trial" instead falls back to a DB-only trial
    // row in subscription.tsx, with nothing in App Store/Play Store to
    // actually cancel.
    //
    // Made this one a function of usePurchases().configured (Anabelle,
    // same day: "write the cancellation copy as it would be once we are
    // live and functional for all users") instead of manually swapping
    // the string again the day RevenueCat's keys actually go in --
    // CANCEL_ANSWER_LIVE takes over automatically the moment `configured`
    // flips true, same "derive from real state" precedent as
    // SUPPORT_EMAIL above.
    answer: (purchasesConfigured) => (purchasesConfigured ? CANCEL_ANSWER_LIVE : CANCEL_ANSWER_PENDING),
  },
  {
    question: 'Which stores does Grrunch cover?',
    answer: 'Save-On-Foods, Real Canadian Superstore, No Frills, Safeway, and Walmart.',
  },
  {
    question: "What do the price tags on ingredients mean?",
    answer:
      'Each one shows whether a price is a real flyer markdown, priced well below typical cost, a fair everyday price, or an estimate. See Settings > How it works for the full breakdown.',
  },
  {
    question: "My store isn't the one I want — can I change it?",
    answer:
      "Free accounts get stores auto-selected from your location. Members can choose their own from Profile > My stores.",
  },
];
