import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SupportBubble } from '../components/SupportBubble';
import { AuthProvider } from '../lib/auth';
import { PersonalTargetsProvider } from '../lib/personalTargets';
import { PlanTargetsProvider } from '../lib/planTargets';
import { SavedRecipesProvider } from '../lib/savedRecipes';
import { SelectedDealsProvider } from '../lib/selectedDeals';
import { SelectedMealsProvider } from '../lib/selectedMeals';
import { SelectedStoresProvider } from '../lib/selectedStores';
import { supabase } from '../lib/supabase';

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
// the "Meals" tab, i.e. Plan your meals). Grocery list lives in the
// (tabs) group as its own tab now, not a pushed modal screen.
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <PersonalTargetsProvider>
          <SelectedStoresProvider>
            <SavedRecipesProvider>
              <SelectedMealsProvider>
                <SelectedDealsProvider>
                  <PlanTargetsProvider>
                    <Stack screenOptions={{ headerShown: false }}>
                      <Stack.Screen name="index" />
                      <Stack.Screen name="login" />
                      <Stack.Screen name="location" />
                      <Stack.Screen name="stores" />
                      <Stack.Screen name="(tabs)" />
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
                  </PlanTargetsProvider>
                </SelectedDealsProvider>
              </SelectedMealsProvider>
            </SavedRecipesProvider>
          </SelectedStoresProvider>
        </PersonalTargetsProvider>
      </AuthProvider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
