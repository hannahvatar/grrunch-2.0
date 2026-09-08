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
  answer: string;
}

// Grounded in what's actually real about the app right now (matches
// settings-detail.tsx's About copy / how-it-works.tsx / upgrade.tsx) --
// not generic filler FAQ copy.
export const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'Do I need an account to use Grrunch?',
    answer:
      "No, you can browse recipes and this week's deals as a guest, but without an account you can't add recipes to your grocery list, pick or edit your stores, save recipes to your favourites, see companion recipes, or see more than 3 of the week's recipes and 1 deal per category. A free account (still free, separate from membership) unlocks building your grocery list. Everything else on that list needs membership.",
  },
  {
    question: 'What does membership include?',
    answer:
      "A 30-day free trial, then $5.99/mo. It unlocks all of this week's recipes (not just 3), every deal in each category (not just one), unlimited saved recipes, companion recipes, and choosing your own stores instead of the ones auto-selected from your location. Cancel anytime.",
  },
  {
    question: 'How do I cancel my trial or membership?',
    answer:
      'From your Apple or Google account’s own subscription settings. That’s the same place any App Store/Play Store subscription is managed, since Grrunch doesn’t bill you directly.',
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
