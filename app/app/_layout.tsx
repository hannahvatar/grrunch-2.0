import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShadowVisible: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="consent"
          options={{ presentation: 'modal', title: 'Terms & Privacy' }}
        />
        <Stack.Screen name="plan/setup" options={{ title: 'Set up your plan' }} />
        <Stack.Screen name="plan/household" options={{ title: 'Household' }} />
        <Stack.Screen name="plan/preferences" options={{ title: 'Cost vs. variety' }} />
        <Stack.Screen name="plan/meals" options={{ title: "This week's meals" }} />
        <Stack.Screen name="plan/grocery-list" options={{ title: 'Grocery list' }} />
      </Stack>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
