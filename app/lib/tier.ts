// Free vs paid tier limits — architecture.md section 2.5, with two
// deliberate deviations from what's currently written there: the doc says
// free tier gets "1 store selection." That was superseded in-session — free
// now auto-selects all nearest stores same as paid, just can't edit that
// selection (remove a store or swap a location) without upgrading. storeCount
// is 6, not 5 — Real Canadian Superstore and No Frills are tracked as two
// separate chains (separate storefronts/flyers/pricing), not one merged
// slot. The doc itself hasn't been updated to match either change yet.
export const TIER_LIMITS = {
  free: {
    storeCount: 6,
    storesEditable: false,
    mealCount: 5,
    householdProfiles: 1,
    savedRecipesMax: 2,
  },
  paid: {
    storeCount: 6,
    storesEditable: true,
    mealCount: 10,
    householdProfiles: Infinity,
    savedRecipesMax: Infinity,
  },
} as const;

export type Tier = keyof typeof TIER_LIMITS;
