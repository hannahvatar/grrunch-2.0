import { ComponentType, ReactNode } from 'react';
import { PostHogProvider } from 'posthog-react-native';
import * as Sentry from '@sentry/react-native';

// Crash reporting (Sentry) + product analytics (PostHog) -- both genuinely
// optional until real keys exist (Anabelle, 2026-08-31: "let implement
// this"). Same env-var-gated, silently-no-op-until-configured pattern as
// RevenueCat (lib/purchases.tsx) -- nobody's build breaks, and nothing
// gets silently reported anywhere, just because these keys aren't set.
//
// Both are EXPO_PUBLIC_* (embedded client-side) -- same trust level as
// EXPO_PUBLIC_SUPABASE_ANON_KEY already is. Sentry DSNs and PostHog
// project API keys are both meant to be public/client-embeddable by
// design (unlike, say, a webhook secret) -- this isn't a new exposure.
//
// This file is the NATIVE (iOS/Android) version -- @sentry/react-native
// has no web build at all (unlike react-native-purchases, which resolves
// fine on web and just no-ops at runtime; this package fails to *resolve*
// on web, breaking the whole bundle). See observability.web.tsx for the
// web-safe version Metro's platform-extension resolution picks up
// instead -- that file never imports @sentry/react-native at all, so it
// never enters the web module graph.

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const sentryConfigured = !!SENTRY_DSN;

// Call once, as early as possible in app startup (see app/_layout.tsx) --
// Sentry can only catch what happens after init() runs.
export function initSentry(): void {
  if (!SENTRY_DSN) return;
  Sentry.init({
    dsn: SENTRY_DSN,
    // Conservative default -- trace 20% of transactions rather than
    // 100%, so the free tier's event quota lasts through early testing
    // instead of getting burned by every single navigation.
    tracesSampleRate: 0.2,
  });
}

// Adds an error boundary + navigation tracing around the whole app --
// safe to call unconditionally even when EXPO_PUBLIC_SENTRY_DSN isn't
// set: without a prior initSentry() call, everything it would normally
// capture/send is just dropped locally (standard Sentry SDK behavior
// across every platform, not something specific to this setup).
export function wrapWithSentry<P extends Record<string, unknown>>(
  RootComponent: ComponentType<P>
): ComponentType<P> {
  return Sentry.wrap(RootComponent);
}

const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
// PostHog Cloud has two regions with different hosts -- default to US
// (posthog.com's default signup region) but let a real project override
// it via env if the account turns out to be EU-hosted instead.
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
export const posthogConfigured = !!POSTHOG_API_KEY;

// Wraps the app in PostHogProvider only when a real key exists --
// explicit conditional render, not relying on the SDK to silently no-op
// on an empty apiKey (same caution as IS_NATIVE in lib/purchases.tsx:
// check the real condition ourselves rather than trust unverified
// library behavior for the unconfigured case).
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  if (!POSTHOG_API_KEY) return <>{children}</>;
  return (
    <PostHogProvider apiKey={POSTHOG_API_KEY} options={{ host: POSTHOG_HOST }}>
      {children}
    </PostHogProvider>
  );
}
