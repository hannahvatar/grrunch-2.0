import AsyncStorage from '@react-native-async-storage/async-storage';

// Soft, one-time nudge toward creating a free (non-member) account --
// Anabelle, 2026-08-28: "nudge sign-up earlier ... after viewing a few
// recipes", explicitly the skippable option, not a hard sign-up wall.
// Distinct from every other sign-in prompt in the app (which all show up
// only when a guest hits an actually-locked feature) -- this one fires
// from ordinary browsing, purely to invite account creation (which is
// free and unrelated to membership -- see lib/subscription.tsx).
//
// Local-only (AsyncStorage, same pattern as lib/selectedStores.tsx) --
// there's no account yet to store this against; it resets if the app is
// reinstalled, which is fine for a one-time nudge.
const VIEWED_RECIPES_KEY = 'grrunch.guestNudge.viewedRecipeIds';
const SHOWN_KEY = 'grrunch.guestNudge.shown';
const VIEW_THRESHOLD = 3;

async function getViewedRecipeIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(VIEWED_RECIPES_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

// Call once a recipe has actually loaded (not on every id param change --
// see recipe.tsx). Deduped by id, so re-opening the same recipe repeatedly
// doesn't inflate the count.
export async function recordRecipeView(recipeId: string): Promise<void> {
  try {
    const ids = await getViewedRecipeIds();
    if (!ids.includes(recipeId)) {
      await AsyncStorage.setItem(VIEWED_RECIPES_KEY, JSON.stringify([...ids, recipeId]));
    }
  } catch {
    // Best-effort -- a failed write just means the nudge might not fire
    // this session, not worth surfacing an error for.
  }
}

// True once, the first time the threshold is crossed -- caller is
// expected to also call markNudgeShown() right after acting on a true
// result, so this never fires twice.
export async function shouldShowSignupNudge(): Promise<boolean> {
  try {
    const alreadyShown = await AsyncStorage.getItem(SHOWN_KEY);
    if (alreadyShown === 'true') return false;
    const ids = await getViewedRecipeIds();
    return ids.length >= VIEW_THRESHOLD;
  } catch {
    return false;
  }
}

export async function markSignupNudgeShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(SHOWN_KEY, 'true');
  } catch {
    // Best-effort, same as above.
  }
}
