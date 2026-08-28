// Get support (Anabelle, 2026-08-28: live chat needs a real 3rd-party
// provider she hasn't set up yet, so this is the email-only path for now
// -- "Contact us" composes a real email via the device's own mail client
// (Linking + mailto:), no chat widget, no fake "connecting you to an
// agent" UI that doesn't actually connect to anyone).
//
// No real support inbox exists yet either -- deliberately null, not a
// placeholder-looking address like support@grrunch.com, which would
// silently compose emails to a mailbox nobody reads. Fill in once a real
// one exists; get-support.tsx already renders an honest "not set up yet"
// state for as long as this stays null.
export const SUPPORT_EMAIL: string | null = null;

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
      "No — you can browse recipes and this week's deals as a guest. A free account lets you save recipes and pick up where you left off; it's separate from membership and doesn't cost anything.",
  },
  {
    question: 'What does membership include?',
    answer:
      "A 30-day free trial, then $5.99/mo. It unlocks the full recipe library, unlimited saved recipes, and choosing your own stores instead of the ones auto-selected from your location. Cancel anytime.",
  },
  {
    question: 'How do I cancel my trial or membership?',
    answer:
      'From your Apple or Google account’s own subscription settings — the same place any App Store/Play Store subscription is managed, since Grrunch doesn’t bill you directly.',
  },
  {
    question: 'Which stores does Grrunch cover?',
    answer: 'Save-On-Foods, Real Canadian Superstore, No Frills, Safeway, and Walmart.',
  },
  {
    question: "What do the price tags on ingredients mean?",
    answer:
      'Each one shows whether a price is a real flyer markdown, priced well below typical cost, a fair everyday price, or an estimate — see Settings > How it works for the full breakdown.',
  },
  {
    question: "My store isn't the one I want — can I change it?",
    answer:
      "Free accounts get stores auto-selected from your location. Members can choose their own from Profile > My stores.",
  },
];
