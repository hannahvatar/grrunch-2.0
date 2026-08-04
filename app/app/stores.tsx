import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CheckIcon, LockClosedIcon, MapPinIcon } from 'react-native-heroicons/outline';

import { useSelectedStores } from '../lib/selectedStores';
import { useSubscription } from '../lib/subscription';
import { supabase } from '../lib/supabase';

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

  // Only persists on the deliberate "Track all N stores" confirmation, not
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
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <MapPinIcon size={40} color="#111" />
          <Text style={styles.title}>No location yet</Text>
          <Text style={styles.subtitle}>
            Turn on location to see the stores nearest you. Manual store search isn't available yet.
          </Text>
          <Pressable style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Enable location</Text>
          </Pressable>
          <Pressable onPress={goToPlanMeals}>
            <Text style={styles.skipText}>Skip for now</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#111" />
        <Text style={styles.loadingText}>Finding stores near you…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Stores near you</Text>
        <Text style={styles.subtitle}>
          {storesEditable
            ? 'Select the stores you want to track — you can refine this anytime in Profile settings.'
            : 'Your nearest stores, selected automatically. Upgrade to remove a store or change a location.'}
        </Text>
        {stores.map((store) => (
          <Pressable
            key={store.id}
            style={styles.storeRow}
            onPress={storesEditable ? undefined : showUpgradePrompt}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{store.initial}</Text>
            </View>
            <View style={styles.storeInfo}>
              <Text style={styles.storeName}>{store.name}</Text>
              <Text style={styles.storeSubtitle}>{store.subtitle}</Text>
            </View>
            {store.distanceKm !== null && (
              <Text style={styles.distance}>{store.distanceKm.toFixed(1)} km</Text>
            )}
            <View style={styles.checkmarkOn}>
              <CheckIcon size={13} color="#fff" />
            </View>
            {!storesEditable && <LockClosedIcon size={14} color="#999" style={styles.lockIcon} />}
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable style={styles.primaryButton} onPress={confirmStores}>
          <Text style={styles.primaryButtonText}>Track all {stores.length} stores</Text>
        </Pressable>
        {!storesEditable && (
          <Pressable onPress={showUpgradePrompt}>
            <Text style={styles.upgradeText}>Want to change a store? Upgrade to customize</Text>
          </Pressable>
        )}
        <Pressable onPress={goToPlanMeals}>
          <Text style={styles.skipText}>Skip for now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#888' },
  scrollContent: { padding: 24, paddingTop: 64, gap: 12 },
  title: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 8 },
  emptyState: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 12 },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  storeInfo: { flex: 1 },
  storeName: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  storeSubtitle: { fontSize: 13, color: '#888' },
  distance: { fontSize: 13, color: '#999' },
  lockIcon: { fontSize: 14, marginLeft: 4 },
  checkmarkOn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#111',
    borderColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { padding: 24, borderTopWidth: 1, borderTopColor: '#eee' },
  primaryButton: {
    width: '100%',
    backgroundColor: '#111',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  upgradeText: { color: '#2C5FD6', fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', textAlign: 'center', marginTop: 14 },
  skipText: { color: '#999', fontSize: 15, textAlign: 'center', marginTop: 10 },
});
