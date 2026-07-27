import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SavedRecipesProvider } from '../lib/savedRecipes';

// Guest-mode onboarding stack — matches the wireframed flow:
// Terms -> Login/Guest -> Location -> Stores -> Main App (tabs, starting on
// the "Meals" tab, i.e. Plan your meals). Grocery list is a modal sheet
// over the Plan tab, not a pushed screen. Plan your meals lives inside the
// (tabs) group (not here) so the bottom nav is present on it too.
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SavedRecipesProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="location" />
          <Stack.Screen name="stores" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="grocery-list"
            options={{ presentation: 'modal', headerShown: false }}
          />
          <Stack.Screen name="recipe" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="upgrade" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="auth-error" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="offline" options={{ presentation: 'modal', headerShown: false }} />
        </Stack>
      </SavedRecipesProvider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
