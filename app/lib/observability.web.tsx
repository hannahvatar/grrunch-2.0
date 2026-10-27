import { ComponentType, ReactNode, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { PostHogProvider, usePostHog } from 'posthog-react-native';

import { clearAnalyticsStorage, useAnalyticsConsent } from './analyticsConsent';

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

// PostHog only after the visitor accepts analytics on the cookie banner
// (lib/analyticsConsent.ts). Once mounted it stays mounted for the visit,
// so a later Decline (Profile > Settings > Cookies) opts out and clears
// PostHog's stored id instead; the next visit doesn't load it at all.
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const consent = useAnalyticsConsent();
  const startedThisVisit = useRef(false);
  if (consent === 'granted') startedThisVisit.current = true;
  // Beside the app, not around it: switching from no provider to a
  // wrapping one would remount the whole app on Accept (and lose the
  // in-memory list). Nothing in the app reads the PostHog context.
  return (
    <>
      {POSTHOG_API_KEY && startedThisVisit.current && (
        // PostHogProvider renders a flex: 1 View; as a sibling of the app it
        // took half the screen (white gap above the top bar). A zero-size,
        // out-of-flow box keeps it invisible.
        <View style={styles.hiddenHost} pointerEvents="none" aria-hidden>
          <PostHogProvider apiKey={POSTHOG_API_KEY} options={{ host: POSTHOG_HOST }}>
            <OptOutWhenDeclined />
          </PostHogProvider>
        </View>
      )}
      {children}
    </>
  );
}

function OptOutWhenDeclined() {
  const posthog = usePostHog();
  const consent = useAnalyticsConsent();
  useEffect(() => {
    if (consent === 'granted') {
      posthog?.optIn();
    } else {
      // Stop sending, then delete its ids and queued events once it has
      // finished writing the opt-out.
      Promise.resolve(posthog?.optOut())
        .then(() => posthog?.reset())
        .finally(() => setTimeout(clearAnalyticsStorage, 500));
    }
  }, [consent, posthog]);
  return null;
}

const styles = StyleSheet.create({
  hiddenHost: { position: 'absolute', width: 0, height: 0, overflow: 'hidden' },
});
