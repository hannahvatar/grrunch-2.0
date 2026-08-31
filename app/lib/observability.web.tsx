import { ComponentType, ReactNode } from 'react';
import { PostHogProvider } from 'posthog-react-native';

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

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  if (!POSTHOG_API_KEY) return <>{children}</>;
  return (
    <PostHogProvider apiKey={POSTHOG_API_KEY} options={{ host: POSTHOG_HOST }}>
      {children}
    </PostHogProvider>
  );
}
