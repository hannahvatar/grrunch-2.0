import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ArrowRightIcon, BuildingStorefrontIcon } from 'react-native-heroicons/outline';

import { DesktopAuthShell, desktopText } from '../components/DesktopAuthShell';
import { HOME_ROUTE, useIsDesktop } from '../lib/layout';
import { useSelectedStores } from '../lib/selectedStores';
import { useSubscription } from '../lib/subscription';
import { supabase } from '../lib/supabase';

// GRRUNCH DS -- matches login.tsx/index.tsx/location.tsx's palette.
const ACCENT = '#FFA955';
const INK = '#111';

// Anabelle: size the store-list card to fit exactly 5 rows tall, hugging
// content when there are fewer, scrolling internally beyond that -- not a
// fixed-height box with empty space below a short list, and not one that
// grows past 5 rows and pushes Continue off-screen when there are many.
// ROW_HEIGHT is the row's own fixed height (avatar 40 + storeRow's
// paddingVertical 14*2 + its 1px bottom border) -- storeName/storeSubtitle
// together never exceed the avatar's 40, so the avatar is what actually
// governs row height, not the text. listContent's paddingVertical (4+4)
// is added once for the whole list, not per row.
const ROW_HEIGHT = 40 + 14 * 2 + 1;
const MAX_VISIBLE_ROWS = 5;
const LIST_MAX_HEIGHT = ROW_HEIGHT * MAX_VISIBLE_ROWS + 4 * 2;
// Everything on the desktop page that isn't the list: shell header (96)
// and bottom padding (96), headline (52 + 20), two-line subtitle (48 + 24),
// Continue (56 + 24), plus breathing room.
const DESKTOP_LIST_CHROME = 460;

// Guest-mode wireframe step 4 — Stores near you.
// Wired to the deployed nearest-stores Edge Function (see
// supabase/functions/nearest-stores/index.ts) using coords forwarded from
// the Location screen when available. If no coords were forwarded
// (manual/skip path — no manual search UI exists yet), the function itself
// now falls back to coarse, city-level IP geolocation (2026-08-26,
// Anabelle: "yes lets tackle this now" -- the architecture.md-documented
// "location declined -> coarse fallback" path). Only if THAT also can't
// resolve anything (no usable client IP -- notably local dev) does this
// screen show its honest no-location state instead of mock data.
interface StoreRow {
  id: string;
  chain_name: string;
  banner: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
}

interface DisplayStore {
  id: string;
  initial: string;
  name: string;
  subtitle: string;
  distanceKm: number | null;
  // Carried through to SelectedStore on confirm -- lib/dealZones.ts needs
  // a real point to match this store against its chain's zone anchors.
  lat: number | null;
  lng: number | null;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function showUpgradePrompt() {
  router.push({ pathname: '/upgrade', params: { reason: 'remove a store or change its location' } });
}

export default function StoresScreen() {
  const { lat, lng } = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const hasPreciseLocation = typeof lat === 'string' && typeof lng === 'string';
  const { setStores: setSelectedStores } = useSelectedStores();
  const { isSubscribed: storesEditable } = useSubscription();
  const isDesktop = useIsDesktop();
  const { height: windowHeight } = useWindowDimensions();
  // Desktop: the store list scrolls inside its card, sized to whatever the
  // window leaves after the header, headline, text and Continue, so the
  // page itself never scrolls (Anabelle, 2026-10-22). At least 2 rows.
  const desktopListMaxHeight = Math.max(
    ROW_HEIGHT * 2 + 8,
    Math.min(LIST_MAX_HEIGHT, windowHeight - DESKTOP_LIST_CHROME)
  );

  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<DisplayStore[]>([]);
  // Whether the result came from real device coords vs. the coarse,
  // city-level IP fallback (nearest-stores' `precise` field) -- distance
  // figures only get shown for a precise result; an IP-based guess isn't
  // accurate enough to claim "X km away" without overstating confidence.
  const [precise, setPrecise] = useState(hasPreciseLocation);
  // True once the fetch has come back with a genuinely empty result (both
  // the precise path, when coords were sent, AND the server's own IP
  // fallback failed to resolve anything -- e.g. local dev, or ip-api.com
  // itself down) -- the only case that still shows the honest
  // no-location state instead of a result list.
  const [locationUnavailable, setLocationUnavailable] = useState(false);

  useEffect(() => {
    const userLat = hasPreciseLocation ? Number(lat) : null;
    const userLng = hasPreciseLocation ? Number(lng) : null;

    let cancelled = false;
    setLoading(true);

    supabase.functions
      .invoke<{ stores?: StoreRow[]; precise?: boolean; error?: string }>('nearest-stores', {
        // Sending {} (not omitting the body) when there's no precise fix
        // yet -- app/location.tsx's "Choose store manually"/"Skip for
        // now" both land here with no params -- triggers the function's
        // own coarse IP-geolocation fallback instead of erroring.
        body: hasPreciseLocation ? { lat: userLat, lng: userLng } : {},
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.stores) {
          router.replace({
            pathname: '/error',
            params: {
              body: "We couldn't load stores near you. Please try again.",
              footnote: 'This uses your location and our stores database.',
            },
          });
          return;
        }
        if (data.stores.length === 0) {
          setLocationUnavailable(true);
          setLoading(false);
          return;
        }
        const resultPrecise = data.precise ?? hasPreciseLocation;
        setPrecise(resultPrecise);
        const display = data.stores
          .map((store) => ({
            id: store.id,
            initial: store.chain_name.charAt(0),
            name: store.chain_name,
            subtitle: store.banner ?? store.address,
            lat: store.lat,
            lng: store.lng,
            distanceKm:
              resultPrecise && userLat !== null && userLng !== null && store.lat !== null && store.lng !== null
                ? haversineKm(userLat, userLng, store.lat, store.lng)
                : null,
          }))
          .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
        setStores(display);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        router.replace({
          pathname: '/error',
          params: { body: "We couldn't load stores near you. Please try again." },
        });
      });

    return () => {
      cancelled = true;
    };
  }, [hasPreciseLocation, lat, lng]);

  function goToFirstTab() {
    router.push(HOME_ROUTE);
  }

  // Only persists on the deliberate "Continue" confirmation, not
  // on "Skip for now" -- Profile > My stores should only ever show a real,
  // confirmed selection, never an unconfirmed fetch result.
  function confirmStores() {
    setSelectedStores(
      stores.map((store) => ({
        id: store.id,
        initial: store.initial,
        name: store.name,
        subtitle: store.subtitle,
        lat: store.lat ?? undefined,
        lng: store.lng ?? undefined,
      }))
    );
    router.push(HOME_ROUTE);
  }

  // Desktop web layout -- see DesktopAuthShell. Same three states as the
  // phone layout below (loading, no location, store list). No
  // illustration, centered on the middle 8 of 12 grid columns (Anabelle,
  // 2026-10-22), same as terms and location; the list and buttons sit in
  // a narrower centered column inside it.
  function desktopShell(children: ReactNode) {
    return (
      <DesktopAuthShell grid span={8}>
        {children}
      </DesktopAuthShell>
    );
  }

  if (loading) {
    if (isDesktop) {
      return desktopShell(
        <View style={desktop.loading}>
          <ActivityIndicator size="large" color={INK} />
          <Text style={[styles.loadingText, desktopText.body]}>Finding stores near you…</Text>
        </View>
      );
    }
    return (
      <LinearGradient colors={['#fff', '#FFEAD4']} style={styles.gradient}>
        <View style={[styles.container, styles.centered]}>
          <ActivityIndicator size="large" color={INK} />
          <Text style={styles.loadingText}>Finding stores near you…</Text>
        </View>
      </LinearGradient>
    );
  }

  // Only reached once the fetch has actually come back empty -- both the
  // precise path (when coords were sent) AND the server's own coarse IP
  // fallback failed to resolve anything. Not shown just because coords
  // weren't sent anymore (2026-08-26 -- that case now goes through the
  // fallback instead of skipping the fetch entirely).
  if (locationUnavailable) {
    if (isDesktop) {
      return desktopShell(
        <>
          <Text style={[desktopText.headline, desktopText.centered]}>No location yet</Text>
          <Text style={[desktopText.body, desktopText.centered]}>
            Turn on location to see the stores nearest you. Manual store search isn't available yet.
          </Text>
          <View style={desktop.column}>
            <Pressable style={styles.primaryButton} onPress={() => router.back()}>
              <Text style={styles.primaryButtonText}>Enable location</Text>
            </Pressable>
            <Pressable style={styles.skipButton} onPress={goToFirstTab} hitSlop={12}>
              <Text style={styles.skipText}>Skip for now</Text>
              <ArrowRightIcon size={16} color={INK} strokeWidth={2} />
            </Pressable>
          </View>
        </>
      );
    }
    return (
      <LinearGradient colors={['#fff', '#FFEAD4']} style={styles.gradient}>
        <View style={styles.container}>
          <View style={styles.emptyState}>
            <Text style={styles.title}>No location yet</Text>
            <Text style={styles.subtitle}>
              Turn on location to see the stores nearest you. Manual store search isn't available yet.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
              onPress={() => router.back()}
            >
              <Text style={styles.primaryButtonText}>Enable location</Text>
            </Pressable>
            <Pressable style={styles.skipButton} onPress={goToFirstTab} hitSlop={12}>
              <Text style={styles.skipText}>Skip for now</Text>
              <ArrowRightIcon size={16} color={INK} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    );
  }

  // Same wording for members and guests (Anabelle, 2026-10-22): the old
  // members-only "Select the stores you want to track" line promised a
  // selection this screen doesn't offer. "approximate" drops out only when
  // real device coordinates were used.
  const subtitleText = precise
    ? "Based on your location, these are the stores we'll use for recipes and grocery deals. You can change them anytime in Settings."
    : "Based on your approximate location, these are the stores we'll use for recipes and grocery deals. You can change them anytime in Settings.";

  const storeList = (
        <View style={styles.listCardOuter}>
      <View style={styles.listCardShadow} />
      <View style={styles.listCard}>
        <ScrollView
          style={[styles.list, isDesktop && { maxHeight: desktopListMaxHeight }]}
          contentContainerStyle={styles.listContent}
        >
          {stores.map((store, index) => (
            <Pressable
              key={store.id}
              style={[styles.storeRow, index === stores.length - 1 && styles.storeRowLast]}
              onPress={storesEditable ? undefined : showUpgradePrompt}
            >
              <View style={styles.avatar}>
                <BuildingStorefrontIcon size={32} color={INK} />
              </View>
              <View style={styles.storeInfo}>
                <View style={styles.storeTopRow}>
                  <Text style={styles.storeName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {store.name}
                  </Text>
                  {store.distanceKm !== null && (
                    <Text style={[styles.distance, isDesktop && desktopText.label]}>{store.distanceKm.toFixed(1)} km</Text>
                  )}
                </View>
                <Text style={[styles.storeSubtitle, isDesktop && desktopText.label]}>{store.subtitle}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );

  if (isDesktop) {
    return desktopShell(
      <>
        <Text style={[desktopText.headline, desktopText.centered]}>Stores near you</Text>
        <Text style={[desktopText.body, desktop.subtitle, desktopText.centered]}>{subtitleText}</Text>
        <View style={desktop.column}>
          <View style={desktop.list}>{storeList}</View>
          <Pressable style={styles.primaryButton} onPress={confirmStores}>
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <LinearGradient colors={['#fff', '#FFEAD4']} style={styles.gradient}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Stores near you</Text>
          <Text style={[styles.subtitle, styles.subtitleInk]}>
            {subtitleText}
          </Text>
        </View>

        {storeList}

        <View style={styles.floatingButtonOuter}>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
            onPress={confirmStores}
          >
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  // justifyContent:'center' only takes effect once a child doesn't fill
  // the main axis on its own -- true for the main content branch now that
  // listCardOuter hugs its content instead of flex:1'ing to fill the
  // screen; the loading/no-location branches still fill it via their own
  // flex:1 inner View (centered/emptyState), so this is a no-op there.
  container: { flex: 1, justifyContent: 'center' },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 16, color: '#343837' },
  // paddingTop was 64 (clearing the status bar) back when this pinned to
  // the top of the screen -- now that the whole block centers vertically,
  // that would just show up as a lopsided gap above the title, so this
  // uses the same uniform padding as everywhere else.
  header: { padding: 24, paddingBottom: 0 },
  listCardOuter: { marginHorizontal: 24, marginTop: 20 },
  // Same flat offset-shadow technique as the legal modal's card and the
  // floating Continue button.
  listCardShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    borderRadius: 24,
    transform: [{ translateX: -1 }, { translateY: 1 }],
  },
  listCard: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 24,
    overflow: 'hidden',
  },
  list: { maxHeight: LIST_MAX_HEIGHT },
  listContent: { paddingHorizontal: 20, paddingVertical: 4 },
  title: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  // 16px body / 14px labels on every layout (Anabelle, 2026-10-22).
  subtitle: { fontSize: 16, lineHeight: 24, color: '#343837', marginBottom: 8 },
  subtitleInk: { color: INK },
  emptyState: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 12 },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#343837',
    paddingVertical: 14,
    gap: 12,
  },
  storeRowLast: { borderBottomWidth: 0 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeInfo: { flex: 1 },
  storeTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // Shrinks to leave room for the distance: "Real Canadian Superstore"
  // pushed "44.1 km" off the card (Anabelle, 2026-10-09).
  storeName: { flexShrink: 1, marginRight: 8, fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  storeSubtitle: { fontSize: 14, color: '#888' },
  distance: { flexShrink: 0, fontSize: 14, color: INK },
  floatingButtonOuter: { padding: 24, paddingTop: 20 },
  primaryButton: {
    width: '100%',
    height: 56,
    justifyContent: 'center',
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 28,
    alignItems: 'center',
  },
  primaryButtonPressed: { borderColor: INK },
  primaryButtonText: { color: INK, fontSize: 17, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  skipButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 },
  skipText: { fontSize: 16, color: INK, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold' },
});

// Desktop web layout -- see DesktopAuthShell.
const desktop = StyleSheet.create({
  loading: { alignItems: 'center', gap: 12 },
  subtitle: { marginBottom: 24 },
  column: { width: 460, alignSelf: 'center' },
  // listCardOuter's 24px side margins are for the phone's screen edges.
  list: { marginHorizontal: -24, marginTop: -20, marginBottom: 24 },
});
