import {
  OpenSans_400Regular,
  OpenSans_600SemiBold,
  OpenSans_700Bold,
  OpenSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/open-sans';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Text, TextInput } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SupportBubble } from '../components/SupportBubble';
import { AuthProvider } from '../lib/auth';
import { AnalyticsProvider, initSentry, wrapWithSentry } from '../lib/observability';
import { SavedRecipesProvider } from '../lib/savedRecipes';
import { SelectedDealsProvider } from '../lib/selectedDeals';
import { SelectedMealsProvider } from '../lib/selectedMeals';
import { SelectedStoresProvider } from '../lib/selectedStores';
import { PurchasesProvider } from '../lib/purchases';
import { SubscriptionProvider } from '../lib/subscription';
import { supabase } from '../lib/supabase';

SplashScreen.preventAutoHideAsync();

// As early as possible -- module scope, not inside the component -- so
// Sentry is armed before RootLayout itself even renders once. No-ops
// entirely if EXPO_PUBLIC_SENTRY_DSN isn't set (see lib/observability.tsx).
initSentry();

// App-wide default -- individual styles still set fontWeight (600/700/800)
// alongside an explicit fontFamily (OpenSans_600SemiBold etc, see the
// per-screen StyleSheets) since a custom single-weight font family doesn't
// get visually bolder from the fontWeight style prop alone the way a
// system font does.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Text as any).defaultProps = { ...(Text as any).defaultProps, style: { fontFamily: 'OpenSans_400Regular' } };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(TextInput as any).defaultProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...(TextInput as any).defaultProps,
  style: { fontFamily: 'OpenSans_400Regular' },
};

// Advances past login once a session genuinely appears from signing in --
// specifically the 'SIGNED_IN' event, not Supabase's 'INITIAL_SESSION'
// (fired on every cold start when a session is merely being restored from
// storage). This is what actually completes email's magic-link flow: the
// confirmation link often opens in a brand new tab/window (mail clients do
// this by default), so the original login screen has no way to know the
// sign-in it started ever finished -- this listener runs globally and
// catches it wherever the session ends up appearing.
function AuthRedirect() {
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        router.replace('/location');
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);
  return null;
}

// Guest-mode onboarding stack — matches the wireframed flow:
// Onboarding (3-screen value-prop carousel, added 2026-09-03) -> Terms ->
// Login/Guest -> Location -> Stores -> Main App (tabs, starting on the
// "Meals" tab). Grocery list lives in the (tabs) group as its own tab
// now, not a pushed modal screen.
function RootLayout() {
  const [fontsLoaded] = useFonts({
    OpenSans_400Regular,
    OpenSans_600SemiBold,
    OpenSans_700Bold,
    OpenSans_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    // Required by react-native-gesture-handler (GroceryListView's
    // swipe-to-remove uses its Swipeable component) -- without this
    // root wrapper, gesture handlers anywhere in the tree silently
    // don't work. Outermost, above SafeAreaProvider, per the library's
    // own setup docs.
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <AnalyticsProvider>
      <AuthProvider>
        <SubscriptionProvider>
          <PurchasesProvider>
            <SelectedStoresProvider>
              <SavedRecipesProvider>
                <SelectedMealsProvider>
                  <SelectedDealsProvider>
                    <Stack screenOptions={{ headerShown: false }}>
                      <Stack.Screen name="index" />
                      <Stack.Screen name="terms" />
                      <Stack.Screen name="login" />
                      <Stack.Screen name="location" />
                      <Stack.Screen name="stores" />
                      <Stack.Screen name="(tabs)" />
                      <Stack.Screen name="dev-recipes" />
                      <Stack.Screen name="dev-deals" />
                      <Stack.Screen name="dev-cost" />
                      <Stack.Screen name="settings" />
                      <Stack.Screen name="settings-detail" />
                      <Stack.Screen name="manage-account" />
                      <Stack.Screen name="payment" />
                      <Stack.Screen name="notifications" />
                      <Stack.Screen name="notifications-push" />
                      <Stack.Screen name="notifications-email" />
                      <Stack.Screen name="get-support" />
                      <Stack.Screen name="privacy-policy" />
                      <Stack.Screen name="legal" />
                      <Stack.Screen name="how-it-works" />
                      <Stack.Screen name="recipe" options={{ presentation: 'modal', headerShown: false }} />
                      <Stack.Screen name="upgrade" options={{ presentation: 'modal', headerShown: false }} />
                      <Stack.Screen
                        name="signup-nudge"
                        options={{ presentation: 'modal', headerShown: false }}
                      />
                      <Stack.Screen name="error" options={{ presentation: 'modal', headerShown: false }} />
                      <Stack.Screen name="offline" options={{ presentation: 'modal', headerShown: false }} />
                      <Stack.Screen
                        name="no-account"
                        options={{ presentation: 'modal', headerShown: false }}
                      />
                      <Stack.Screen
                        name="account-unavailable"
                        options={{ presentation: 'modal', headerShown: false }}
                      />
                      <Stack.Screen
                        name="account-deleted"
                        options={{ presentation: 'modal', headerShown: false }}
                      />
                      <Stack.Screen
                        name="access-revoked"
                        options={{ presentation: 'modal', headerShown: false }}
                      />
                    </Stack>
                    <AuthRedirect />
                    <SupportBubble />
                  </SelectedDealsProvider>
                </SelectedMealsProvider>
              </SavedRecipesProvider>
            </SelectedStoresProvider>
          </PurchasesProvider>
        </SubscriptionProvider>
      </AuthProvider>
      </AnalyticsProvider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// wrapWithSentry adds an error boundary + navigation tracing around the
// whole app on native -- a no-op passthrough on web, and safe to call
// unconditionally on native even when EXPO_PUBLIC_SENTRY_DSN isn't set
// (see lib/observability.tsx's own comment for why).
export default wrapWithSentry(RootLayout);
