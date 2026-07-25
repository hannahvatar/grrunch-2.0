// Free vs paid tier limits — architecture.md section 2.5, with one
// deliberate deviation from what's currently written there: the doc says
// free tier gets "1 store selection." That was superseded in-session — free
// now auto-selects all 5 nearest stores same as paid, just can't edit that
// selection (remove a store or swap a location) without upgrading. The doc
// itself hasn't been updated to match yet.
export const TIER_LIMITS = {
  free: {
    storeCount: 5,
    storesEditable: false,
    mealCount: 5,
    householdProfiles: 1,
    savedRecipesMax: 2,
  },
  paid: {
    storeCount: 5,
    storesEditable: true,
    mealCount: 10,
    householdProfiles: Infinity,
    savedRecipesMax: Infinity,
  },
} as const;

export type Tier = keyof typeof TIER_LIMITS;
