import { Tabs } from 'expo-router';
import { Text } from 'react-native';

function TabIcon({ symbol }: { symbol: string }) {
  return <Text style={{ fontSize: 20 }}>{symbol}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="meals"
        options={{ title: 'Meals', tabBarIcon: () => <TabIcon symbol="🍴" /> }}
      />
      <Tabs.Screen
        name="best-deals"
        options={{ title: 'Best Deals', tabBarIcon: () => <TabIcon symbol="🏷️" /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: () => <TabIcon symbol="👤" /> }}
      />
    </Tabs>
  );
}
