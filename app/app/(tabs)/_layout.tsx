import { Tabs, usePathname } from 'expo-router';
import { Platform, useWindowDimensions, View } from 'react-native';
import { HomeIcon } from 'react-native-heroicons/outline';

import { AppTopBar } from '../../components/AppTopBar';
import { ListAltIcon, PersonIcon, RestaurantIcon, SellIcon } from '../../components/MaterialSymbols';
import { PhoneColumn } from '../../components/WebFrame';
import { useIsDesktop } from '../../lib/layout';
import { useSelectedMeals } from '../../lib/selectedMeals';

// AppTopBar sits outside <Tabs> entirely (not per-screen) so it's one
// persistent instance across every tab switch -- see its own header
// comment for why (scope, replacing AccountBanner, etc.).
//
// Desktop web (2026-10-22): the bottom tab bar is hidden and AppTopBar
// becomes a full-width top nav with the 4 tabs as links. Each page sits
// in PhoneColumn under it until it gets its own desktop layout; tab pages
// listed in DESKTOP_READY_TABS lay themselves out on the full width.
const DESKTOP_READY_TABS = new Set(['/home', '/best-deals', '/recipes', '/grocery', '/profile']);

export default function TabsLayout() {
  const isDesktop = useIsDesktop();
  // Recipes on the list, as an orange badge on the My list tab (Anabelle,
  // 2026-10-26; same badge as the desktop top bar's).
  const listCount = useSelectedMeals().selectedIds.size;
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
        {/* Web-only Home tab (Anabelle, 2026-10-23); hidden on the iPhone
            app, which keeps its 4 tabs. */}
        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            href: Platform.OS === 'web' ? undefined : null,
            tabBarIcon: ({ color }) => <HomeIcon size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="best-deals"
          options={{ title: 'Weekly Deals', tabBarIcon: ({ color }) => <SellIcon size={22} color={color} /> }}
        />
        <Tabs.Screen
          name="recipes"
          options={{ title: 'Recipes', tabBarIcon: ({ color }) => <RestaurantIcon size={22} color={color} /> }}
        />
        {/* Old /meals address, forwards to /recipes; never shown in the
            tab bar. */}
        <Tabs.Screen name="meals" options={{ href: null }} />
        <Tabs.Screen
          name="grocery"
          options={{
            title: 'My list',
            tabBarIcon: ({ color }) => <ListAltIcon size={22} color={color} />,
            tabBarBadge: listCount > 0 ? listCount : undefined,
            tabBarBadgeStyle: { backgroundColor: '#FFA955', color: '#111', fontWeight: '800', fontSize: 11 },
          }}
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
