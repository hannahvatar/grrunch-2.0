// A visitor who taps "Start free trial" while signed out has to make an
// account first. Sign-in then runs location -> stores like any other
// sign-in, and used to end on Home, so nobody ever reached checkout
// (Anabelle, 2026-11-01: testers thought they'd started a trial; none
// had). This remembers the tap so the stores step hands them back to
// /upgrade instead.
//
// localStorage, not memory: Google/Apple sign-in is a full-page redirect
// and the email link often opens in a new tab. Expires after an hour so
// an abandoned sign-up doesn't hijack a later visit.
const STORAGE_KEY = 'grrunch.pendingTrial';
const MAX_AGE_MS = 60 * 60 * 1000;

let inMemory: { reason: string; at: number } | null = null;

export function rememberTrialIntent(reason: string | undefined): void {
  inMemory = { reason: reason ?? '', at: Date.now() };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(inMemory));
  } catch {
    // Native, or storage blocked: the in-memory copy still covers it.
  }
}

// Returns the reason (possibly '') once, then forgets it. Null = no trial
// was started before signing in.
export function takeTrialIntent(): string | null {
  let saved = inMemory;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) saved = JSON.parse(raw);
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Keep the in-memory copy.
  }
  inMemory = null;
  if (!saved || Date.now() - saved.at > MAX_AGE_MS) return null;
  return saved.reason;
}
