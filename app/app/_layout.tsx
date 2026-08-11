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
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SupportBubble } from '../components/SupportBubble';
import { AuthProvider } from '../lib/auth';
import { SavedRecipesProvider } from '../lib/savedRecipes';
import { SelectedDealsProvider } from '../lib/selectedDeals';
import { SelectedMealsProvider } from '../lib/selectedMeals';
import { SelectedStoresProvider } from '../lib/selectedStores';
import { SubscriptionProvider } from '../lib/subscription';
import { supabase } from '../lib/supabase';

SplashScreen.preventAutoHideAsync();

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
// Terms -> Login/Guest -> Location -> Stores -> Main App (tabs, starting on
// the "Meals" tab). Grocery list lives in the (tabs) group as its own tab
// now, not a pushed modal screen.
export default function RootLayout() {
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
    <SafeAreaProvider>
      <AuthProvider>
        <SubscriptionProvider>
          <SelectedStoresProvider>
            <SavedRecipesProvider>
              <SelectedMealsProvider>
                <SelectedDealsProvider>
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="login" />
                    <Stack.Screen name="location" />
                    <Stack.Screen name="stores" />
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="dev-recipes" />
                    <Stack.Screen name="dev-deals" />
                    <Stack.Screen name="settings" />
                    <Stack.Screen name="settings-detail" />
                    <Stack.Screen name="recipe" options={{ presentation: 'modal', headerShown: false }} />
                    <Stack.Screen name="upgrade" options={{ presentation: 'modal', headerShown: false }} />
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
        </SubscriptionProvider>
      </AuthProvider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
