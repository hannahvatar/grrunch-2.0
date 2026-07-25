import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Guest-mode onboarding stack — matches the wireframed flow:
// Terms -> Login/Guest -> Location -> Stores -> Plan meals -> Main App (tabs).
// Grocery list is a modal sheet over the Meals tab, not a pushed screen.
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="location" />
        <Stack.Screen name="stores" />
        <Stack.Screen name="plan-meals" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="grocery-list"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen name="recipe" options={{ presentation: 'modal', headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
