import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowRightIcon, BuildingStorefrontIcon, MapPinIcon } from 'react-native-heroicons/outline';

import { useSelectedStores } from '../lib/selectedStores';
import { useSubscription } from '../lib/subscription';
import { supabase } from '../lib/supabase';

// GRRUNCH DS -- matches login.tsx/index.tsx/location.tsx's palette.
const ACCENT = '#FFA955';
const INK = '#111';

// Guest-mode wireframe step 4 — Stores near you.
// Wired to the deployed nearest-stores Edge Function (see
// supabase/functions/nearest-stores/index.ts) using coords forwarded from
// the Location screen. If no coords were forwarded (manual/skip path — no
// manual search UI exists yet), this shows an honest no-location state
// instead of mock data.
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
  const hasLocation = typeof lat === 'string' && typeof lng === 'string';
  const { setStores: setSelectedStores } = useSelectedStores();
  const { isSubscribed: storesEditable } = useSubscription();

  const [loading, setLoading] = useState(hasLocation);
  const [stores, setStores] = useState<DisplayStore[]>([]);

  useEffect(() => {
    if (!hasLocation) return;

    const userLat = Number(lat);
    const userLng = Number(lng);

    let cancelled = false;
    setLoading(true);

    supabase.functions
      .invoke<{ stores?: StoreRow[]; error?: string }>('nearest-stores', {
        body: { lat: userLat, lng: userLng },
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
        const display = data.stores
          .map((store) => ({
            id: store.id,
            initial: store.chain_name.charAt(0),
            name: store.chain_name,
            subtitle: store.banner ?? store.address,
            distanceKm:
              store.lat !== null && store.lng !== null
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
  }, [hasLocation, lat, lng]);

  function goToPlanMeals() {
    router.push('/plan-meals');
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
      }))
    );
    router.push('/plan-meals');
  }

  if (!hasLocation) {
    return (
      <LinearGradient colors={['#fff', '#FFEAD4']} style={styles.gradient}>
        <View style={styles.container}>
          <View style={styles.emptyState}>
            <MapPinIcon size={48} color={INK} strokeWidth={1} />
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
            <Pressable style={styles.skipButton} onPress={goToPlanMeals}>
              <Text style={styles.skipText}>Skip for now</Text>
              <ArrowRightIcon size={16} color={INK} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    );
  }

  if (loading) {
    return (
      <LinearGradient colors={['#fff', '#FFEAD4']} style={styles.gradient}>
        <View style={[styles.container, styles.centered]}>
          <ActivityIndicator size="large" color={INK} />
          <Text style={styles.loadingText}>Finding stores near you…</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#fff', '#FFEAD4']} style={styles.gradient}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Stores near you</Text>
          <Text style={[styles.subtitle, !storesEditable && styles.subtitleInk]}>
            {storesEditable
              ? 'Select the stores you want to track — you can refine this anytime in Profile settings.'
              : "Based on your location, these are the stores we'll use for recipes and grocery deals. You can change them anytime in Settings."}
          </Text>
        </View>

        <View style={styles.listCardOuter}>
          <View style={styles.listCardShadow} />
          <View style={styles.listCard}>
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
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
                      <Text style={styles.storeName}>{store.name}</Text>
                      {store.distanceKm !== null && (
                        <Text style={styles.distance}>{store.distanceKm.toFixed(1)} km</Text>
                      )}
                    </View>
                    <Text style={styles.storeSubtitle}>{store.subtitle}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>

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
  container: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#343837' },
  header: { padding: 24, paddingTop: 64, paddingBottom: 0 },
  listCardOuter: { flex: 1, marginHorizontal: 24, marginTop: 20 },
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
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 24,
    overflow: 'hidden',
  },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingVertical: 4 },
  title: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  subtitle: { fontSize: 14, color: '#343837', marginBottom: 8 },
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
  storeName: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  storeSubtitle: { fontSize: 13, color: '#888' },
  distance: { fontSize: 13, color: INK },
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
