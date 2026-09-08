import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { AppTopBar } from '../../components/AppTopBar';
import { ListAltIcon, PersonIcon, RestaurantIcon, SellIcon } from '../../components/MaterialSymbols';

// AppTopBar sits outside <Tabs> entirely (not per-screen) so it's one
// persistent instance across every tab switch -- see its own header
// comment for why (scope, replacing AccountBanner, etc.).
export default function TabsLayout() {
  return (
    <View style={{ flex: 1 }}>
      <AppTopBar />
      <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#111', tabBarInactiveTintColor: '#999' }}>
        <Tabs.Screen
          name="meals"
          options={{ title: 'Meals', tabBarIcon: ({ color }) => <RestaurantIcon size={22} color={color} /> }}
        />
        <Tabs.Screen
          name="best-deals"
          options={{ title: 'Weekly Deals', tabBarIcon: ({ color }) => <SellIcon size={22} color={color} /> }}
        />
        <Tabs.Screen
          name="grocery"
          options={{ title: 'My list', tabBarIcon: ({ color }) => <ListAltIcon size={22} color={color} /> }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: 'Profile', tabBarIcon: ({ color }) => <PersonIcon size={22} color={color} /> }}
        />
      </Tabs>
    </View>
  );
}
