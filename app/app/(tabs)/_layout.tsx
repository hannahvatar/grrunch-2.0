import { Tabs, usePathname } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';

import { AppTopBar } from '../../components/AppTopBar';
import { ListAltIcon, PersonIcon, RestaurantIcon, SellIcon } from '../../components/MaterialSymbols';
import { PhoneColumn } from '../../components/WebFrame';
import { useIsDesktop } from '../../lib/layout';

// AppTopBar sits outside <Tabs> entirely (not per-screen) so it's one
// persistent instance across every tab switch -- see its own header
// comment for why (scope, replacing AccountBanner, etc.).
//
// Desktop web (2026-10-22): the bottom tab bar is hidden and AppTopBar
// becomes a full-width top nav with the 4 tabs as links. Each page sits
// in PhoneColumn under it until it gets its own desktop layout; tab pages
// listed in DESKTOP_READY_TABS lay themselves out on the full width.
const DESKTOP_READY_TABS = new Set(['/best-deals', '/meals', '/grocery', '/profile']);

export default function TabsLayout() {
  const isDesktop = useIsDesktop();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const framed = isDesktop && !DESKTOP_READY_TABS.has(pathname);
  const tabs = (
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#111',
          tabBarInactiveTintColor: '#999',
          tabBarStyle: isDesktop ? { display: 'none' } : undefined,
        }}
      >
        <Tabs.Screen
          name="best-deals"
          options={{ title: 'Weekly Deals', tabBarIcon: ({ color }) => <SellIcon size={22} color={color} /> }}
        />
        <Tabs.Screen
          name="meals"
          options={{ title: 'Meals', tabBarIcon: ({ color }) => <RestaurantIcon size={22} color={color} /> }}
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
  );
  return (
    <View style={{ flex: 1 }}>
      <AppTopBar />
      {framed ? <PhoneColumn width={width}>{tabs}</PhoneColumn> : tabs}
    </View>
  );
}
