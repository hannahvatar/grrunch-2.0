import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

// Web analytics consent (Anabelle, 2026-10-26). PostHog stays off on web
// until the visitor clicks Accept on the cookie banner -- opt-in, which
// covers Quebec's Law 25 (tracking off by default) as well as BC/federal
// notice-and-choice. Essential storage (sign-in session, stores, list,
// trial) never waits on this.
//
// Remembered per browser in localStorage. Native (the parked iPhone app)
// doesn't use this: app tracking there follows Apple's own rules, so
// it reads as 'granted' and the banner never shows.
export type AnalyticsConsent = 'granted' | 'denied' | null;

const STORAGE_KEY = 'grrunch.analyticsConsent';
// Where posthog-react-native keeps its ids and queue in the browser.
const POSTHOG_STORAGE_KEY = '.posthog-rn.json';
const listeners = new Set<() => void>();

function read(): AnalyticsConsent {
  if (Platform.OS !== 'web') return 'granted';
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    // Private mode / blocked storage: ask again, analytics off meanwhile.
    return null;
  }
}

// Deletes PostHog's stored ids and queued events (after a Decline).
export function clearAnalyticsStorage(): void {
  try {
    window.localStorage.removeItem(POSTHOG_STORAGE_KEY);
  } catch {
    // Nothing stored, or storage blocked.
  }
}

let current: AnalyticsConsent = read();
// Declined earlier: make sure nothing PostHog wrote is left behind.
if (Platform.OS === 'web' && current === 'denied') clearAnalyticsStorage();

export function setAnalyticsConsent(value: 'granted' | 'denied'): void {
  current = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Kept for this visit only.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// null = not chosen yet (the banner shows).
export function useAnalyticsConsent(): AnalyticsConsent {
  return useSyncExternalStore(subscribe, () => current, () => current);
}
