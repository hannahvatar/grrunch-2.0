import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TIER_LIMITS } from '../lib/tier';

// Guest-mode wireframe step 4 — Stores near you.
// Static mock data matching the wireframe for now — wiring this to the real
// nearest-stores Edge Function (needs device/browser geolocation) is a
// separate follow-up, not part of this visual/structural pass.
const MOCK_STORES = [
  { initial: 'S', name: 'Save-On-Foods', subtitle: 'Loyalty rewards & flyer deals', distanceKm: 0.4 },
  {
    initial: 'R',
    name: 'Real Canadian Superstore',
    subtitle: 'No Frills · PC Optimum points',
    distanceKm: 0.8,
  },
  { initial: 'S', name: 'Safeway', subtitle: 'Club Card savings', distanceKm: 1.1 },
  { initial: 'T', name: 'T&T Supermarket', subtitle: 'Asian groceries & fresh produce', distanceKm: 1.6 },
  { initial: 'W', name: 'Walmart', subtitle: 'Everyday low prices', distanceKm: 2.0 },
];

// Guest sessions are treated as free tier — no account/paid-tier check
// exists yet, so this is hardcoded until that's built.
const storesEditable = TIER_LIMITS.free.storesEditable;

function showUpgradePrompt() {
  Alert.alert(
    'Upgrade to customize',
    'Free accounts use your 5 nearest stores automatically. Upgrade to Grrunch Plus to remove a store or choose a different location.'
  );
}

export default function StoresScreen() {
  // Free tier: all 5 nearest stores are selected by default and locked —
  // removing one or swapping a location requires upgrading.
  function goToPlanMeals() {
    router.push('/plan-meals');
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Stores near you</Text>
        <Text style={styles.subtitle}>
          {storesEditable
            ? 'Select the stores you want to track — you can refine this anytime in Profile settings.'
            : 'Your 5 nearest stores, selected automatically. Upgrade to remove a store or change a location.'}
        </Text>
        {MOCK_STORES.map((store) => (
          <Pressable
            key={store.name}
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
            <Text style={styles.distance}>{store.distanceKm} km</Text>
            <View style={styles.checkmarkOn}>
              <Text style={styles.checkmarkText}>✓</Text>
            </View>
            {!storesEditable && <Text style={styles.lockIcon}>🔒</Text>}
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable style={styles.primaryButton} onPress={goToPlanMeals}>
          <Text style={styles.primaryButtonText}>Track all {MOCK_STORES.length} stores</Text>
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
  scrollContent: { padding: 24, paddingTop: 64, gap: 12 },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 8 },
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
  avatarText: { color: '#fff', fontWeight: '700' },
  storeInfo: { flex: 1 },
  storeName: { fontSize: 16, fontWeight: '700' },
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
  checkmarkText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  footer: { padding: 24, borderTopWidth: 1, borderTopColor: '#eee' },
  primaryButton: {
    backgroundColor: '#111',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  upgradeText: { color: '#2C5FD6', fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 14 },
  skipText: { color: '#999', fontSize: 15, textAlign: 'center', marginTop: 10 },
});
