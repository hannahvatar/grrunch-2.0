import { Tabs } from 'expo-router';
import {
  AdjustmentsHorizontalIcon,
  CakeIcon,
  ShoppingBagIcon,
  TagIcon,
  UserIcon,
} from 'react-native-heroicons/outline';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#111', tabBarInactiveTintColor: '#999' }}>
      <Tabs.Screen
        name="plan-meals"
        options={{ title: 'Plan', tabBarIcon: ({ color }) => <AdjustmentsHorizontalIcon size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="meals"
        options={{ title: 'Meals', tabBarIcon: ({ color }) => <CakeIcon size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="grocery"
        options={{ title: 'Grocery', tabBarIcon: ({ color }) => <ShoppingBagIcon size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="best-deals"
        options={{ title: 'Best Deals', tabBarIcon: ({ color }) => <TagIcon size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color }) => <UserIcon size={22} color={color} /> }}
      />
    </Tabs>
  );
}
