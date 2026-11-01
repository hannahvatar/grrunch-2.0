import { ComponentType, ReactNode, useEffect } from 'react';
import posthog from 'posthog-js';

import { clearAnalyticsStorage, useAnalyticsConsent } from './analyticsConsent';
import { supabase } from './supabase';

// Web variant of observability.tsx -- @sentry/react-native has no web
// build at all, so this file exists purely so Metro's platform-extension
// resolution (.web.tsx beats .tsx for a web bundle) picks this instead,
// keeping the native-only package's import out of the web module graph
// entirely. See observability.tsx's own header comment for the full
// explanation. Sentry is simply unavailable on web here -- not a gap
// worth closing, since this app's web build is a dev/preview tool, not a
// real deployed target (see lib/purchases.tsx's identical reasoning for
// why RevenueCat is native-only too).
export const sentryConfigured = false;

export function initSentry(): void {
  // No-op on web.
}

export function wrapWithSentry<P extends Record<string, unknown>>(
  RootComponent: ComponentType<P>
): ComponentType<P> {
  return RootComponent;
}

const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
export const posthogConfigured = !!POSTHOG_API_KEY;

// Local dev (localhost:8081, dev-deals reviews) shares the live project
// key, so it stays out of the numbers.
const IS_LOCAL_DEV =
  typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);

// posthog-js, PostHog's website library, not posthog-react-native: Web
// analytics (visitors, sessions, bounce rate, referrers) only counts the
// web library's events, so it read 0 with the React Native one
// (Anabelle, 2026-11-01). It records a $pageview on every route change
// and a $pageleave for session length; no autocapture, no replays.
//
// Only after the visitor accepts analytics on the cookie banner
// (lib/analyticsConsent.ts). A later Decline (Profile > Settings >
// Cookies) opts out and clears its stored ids; the next visit doesn't
// start it at all.
let started = false;

// Anabelle's own browsers stay out of the numbers too (2026-11-01): once
// one of her accounts signs in, that browser is flagged and never tracked
// again, signed in or not. Only the email check runs here; nothing about
// the account goes to PostHog.
const TEAM_FLAG_KEY = 'grrunch.analyticsTeam';

function isTeamEmail(email: string | undefined): boolean {
  const value = (email ?? '').toLowerCase();
  return value.endsWith('@grrunch.com') || value.endsWith('@extradesigners.com') || value.startsWith('anabelle.dubois');
}

function isTeamBrowser(): boolean {
  try {
    return window.localStorage.getItem(TEAM_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function stopTracking() {
  if (!started) return;
  posthog.opt_out_capturing();
  posthog.reset();
  setTimeout(clearAnalyticsStorage, 500);
}

function markTeamBrowser() {
  try {
    window.localStorage.setItem(TEAM_FLAG_KEY, '1');
  } catch {
    // Storage blocked: stopTracking still covers this visit.
  }
  stopTracking();
}

if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (isTeamEmail(session?.user.email)) markTeamBrowser();
  });
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const consent = useAnalyticsConsent();
  useEffect(() => {
    if (!POSTHOG_API_KEY || IS_LOCAL_DEV) return;
    if (consent === 'granted') {
      if (!started) {
        // Wait for the saved session so a team browser's first page view
        // isn't sent before the email check.
        supabase.auth.getSession().then(({ data }) => {
          if (isTeamEmail(data.session?.user.email)) markTeamBrowser();
          if (started || isTeamBrowser() || !POSTHOG_API_KEY) return;
          started = true;
          posthog.init(POSTHOG_API_KEY, {
            api_host: POSTHOG_HOST,
            persistence: 'localStorage',
            capture_pageview: 'history_change',
            capture_pageleave: true,
            autocapture: false,
            capture_dead_clicks: false,
            disable_session_recording: true,
            disable_surveys: true,
          });
        });
      } else if (!isTeamBrowser()) {
        posthog.opt_in_capturing();
      }
    } else {
      stopTracking();
    }
  }, [consent]);
  return <>{children}</>;
}
