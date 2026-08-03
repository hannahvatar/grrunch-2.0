import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SupportBubble } from '../components/SupportBubble';
import { PersonalTargetsProvider } from '../lib/personalTargets';
import { PlanTargetsProvider } from '../lib/planTargets';
import { SavedRecipesProvider } from '../lib/savedRecipes';
import { SelectedDealsProvider } from '../lib/selectedDeals';
import { SelectedMealsProvider } from '../lib/selectedMeals';
import { SelectedStoresProvider } from '../lib/selectedStores';

// Guest-mode onboarding stack — matches the wireframed flow:
// Terms -> Login/Guest -> Location -> Stores -> Main App (tabs, starting on
// the "Meals" tab, i.e. Plan your meals). Grocery list lives in the
// (tabs) group as its own tab now, not a pushed modal screen.
export default function RootLayout() {
  return (
    <SafeAreaProvider>
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
                  <SupportBubble />
                </PlanTargetsProvider>
              </SelectedDealsProvider>
            </SelectedMealsProvider>
          </SavedRecipesProvider>
        </SelectedStoresProvider>
      </PersonalTargetsProvider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
