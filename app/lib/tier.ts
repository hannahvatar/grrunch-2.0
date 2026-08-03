// Free vs paid tier limits -- trimmed to only what's actually enforced
// somewhere in the app. architecture.md section 2.5 describes a broader
// paid-tier vision (10 meals vs. 5, multiple household profiles, deal
// notifications, unlimited swap/regenerate, unlimited saved recipes) --
// none of those are real gates today: mealCount/householdProfiles/
// savedRecipesMax used to live here but nothing ever read them, household
// profiles aren't a built feature at all this pass (see
// [[project-grrunch-build-status]]), and swap/regenerate/notifications
// don't exist as features yet either. storeCount was identical between
// tiers (6, not a real differentiator) and unused outside this file, so
// it's dropped too -- store editability is the only real free/paid split
// today (see app/stores.tsx, app/(tabs)/profile.tsx).
//
// Add a field back here only once its underlying feature is actually
// built and something in the app reads it -- otherwise this file quietly
// drifts from reality again.
export const TIER_LIMITS = {
  free: {
    storesEditable: false,
  },
  paid: {
    storesEditable: true,
  },
} as const;

export type Tier = keyof typeof TIER_LIMITS;
