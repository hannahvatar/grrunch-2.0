import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CheckBadgeIcon, ChevronRightIcon, Cog6ToothIcon, LockClosedIcon } from 'react-native-heroicons/outline';
import { HeartIcon } from 'react-native-heroicons/solid';

import { AccountBanner } from '../../components/AccountBanner';
import { SubRecipeCard } from '../../components/SubRecipeCard';
import { UpgradeCta } from '../../components/UpgradeCta';
import { useAuth } from '../../lib/auth';
import type { Meal, SubRecipe } from '../../lib/mealData';
import { fetchRecipesByIds } from '../../lib/recipes';
import { useSavedRecipes } from '../../lib/savedRecipes';
import { useSelectedStores } from '../../lib/selectedStores';
import { fetchSubRecipes } from '../../lib/subRecipes';
import { useSubscription } from '../../lib/subscription';

// GRRUNCH DS -- matches login.tsx/index.tsx/location.tsx/stores.tsx/
// meals.tsx's palette. Missing here until now (Anabelle: "all i see and
// black and grey") -- this screen never picked up the app's actual
// peach background/orange accent, just plain white/grey/black.
const ACCENT = '#FFA955';
const INK = '#111';

// No wireframe exists for this page yet (Anabelle, 2026-08-26: "design
// it yourself"). Built out so far: Membership, My stores, Saved
// recipes, Companion recipes -- all real data, no mocked content.
// Grocery list access lives in its own tab (app/(tabs)/grocery.tsx).
export default function ProfileScreen() {
  const { savedIds, toggleSaved } = useSavedRecipes();
  const [savedMeals, setSavedMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);

  const { stores: myStores, loaded: storesLoaded } = useSelectedStores();
  const { status: subscriptionStatus, trialEndsAt, isSubscribed } = useSubscription();
  const { isGuest } = useAuth();

  // Real trial countdown from the same subscriptions row every other
  // section already gates on (useSubscription) -- previously computed
  // nowhere on Profile itself, only used silently to lock/unlock other
  // sections. Guests are skipped entirely: AccountBanner already carries
  // the sign-up prompt at the top of the page, no need to repeat it here.
  const trialDaysLeft =
    subscriptionStatus === 'trialing' && trialEndsAt
      ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : null;

  useEffect(() => {
    fetchRecipesByIds(Array.from(savedIds))
      .then(setSavedMeals)
      .catch(() => setSavedMeals([]))
      .finally(() => setLoading(false));
  }, [savedIds]);

  // Companion recipes -- member-only browse of the full shared
  // sub_recipes table (Anabelle: "make a section in the profile...
  // where users [member only] can access all the companion recipes"),
  // distinct from a single recipe page's jump-linked companion section
  // (app/recipe.tsx), which only ever shows the one relevant to that
  // meal's own ingredients. Defaults each card collapsed -- unlike
  // recipe.tsx's default-open (a jump-link lands you on the one you
  // came for), this is a browse-all list that would otherwise dump
  // every technique's full ingredients/instructions on screen at once.
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([]);
  const [subRecipesLoading, setSubRecipesLoading] = useState(true);
  const [expandedSubRecipes, setExpandedSubRecipes] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchSubRecipes()
      .then(setSubRecipes)
      .catch(() => setSubRecipes([]))
      .finally(() => setSubRecipesLoading(false));
  }, []);

  function isSubRecipeExpanded(title: string) {
    return expandedSubRecipes[title] === true;
  }
  function toggleSubRecipe(title: string) {
    setExpandedSubRecipes((prev) => ({ ...prev, [title]: !isSubRecipeExpanded(title) }));
  }

  return (
    <View style={styles.gradient}>
    <ScrollView contentContainerStyle={styles.container}>
      <AccountBanner />

      <View style={styles.headerRow}>
        <Text style={styles.title}>Profile</Text>
        <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
          <Cog6ToothIcon size={22} color="#111" />
        </Pressable>
      </View>

      {!isGuest && (
        <>
          <Text style={styles.sectionTitle}>Membership</Text>
          {isSubscribed ? (
            subscriptionStatus === 'trialing' ? (
              <View style={styles.membershipCard}>
                <CheckBadgeIcon size={20} color={INK} />
                <View style={styles.membershipTextBlock}>
                  <Text style={styles.membershipTitle}>
                    Free trial · {trialDaysLeft} {trialDaysLeft === 1 ? 'day' : 'days'} left
                  </Text>
                  <Text style={styles.membershipSubtitle}>Then $5.99/mo · Cancel anytime</Text>
                </View>
              </View>
            ) : (
              <View style={styles.membershipCard}>
                <CheckBadgeIcon size={20} color={INK} />
                <View style={styles.membershipTextBlock}>
                  <Text style={styles.membershipTitle}>Grrunch Member</Text>
                  <Text style={styles.membershipSubtitle}>$5.99/mo · Manage in Settings</Text>
                </View>
              </View>
            )
          ) : subscriptionStatus === 'trialing' || subscriptionStatus === 'expired' ? (
            <Pressable
              style={styles.membershipExpiredCard}
              onPress={() => router.push({ pathname: '/upgrade', params: { reason: 'renew your membership' } })}
            >
              <LockClosedIcon size={18} color="#fff" />
              <View style={styles.membershipTextBlock}>
                <Text style={styles.membershipTitleLight}>Your trial has ended</Text>
                <Text style={styles.membershipSubtitleLight}>Resubscribe for $5.99/mo to keep saving recipes</Text>
              </View>
              <ChevronRightIcon size={18} color="#999" />
            </Pressable>
          ) : (
            <UpgradeCta reason="unlock the full app" />
          )}
        </>
      )}

      <Text style={styles.sectionTitle}>My stores</Text>
      {!isSubscribed && (
        <Text style={styles.sectionHint}>Auto-selected from your location · Upgrade to customize</Text>
      )}
      {storesLoaded && myStores.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            No stores yet — set your location to find nearby stores.
          </Text>
          <Pressable style={styles.smallLinkButton} onPress={() => router.push('/location')}>
            <Text style={styles.smallLinkButtonText}>Set my location</Text>
          </Pressable>
        </View>
      ) : (
        myStores.map((store) => (
          <View key={store.id} style={styles.storeRow}>
            <View style={styles.storeAvatar}>
              <Text style={styles.storeAvatarText}>{store.initial}</Text>
            </View>
            <View style={styles.storeInfo}>
              <Text style={styles.storeName}>{store.name}</Text>
              <Text style={styles.storeSubtitle}>{store.subtitle}</Text>
            </View>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Saved recipes</Text>
      {!isSubscribed ? (
        <UpgradeCta reason="save recipes" />
      ) : loading ? (
        <ActivityIndicator size="small" color="#111" style={styles.loadingIndicator} />
      ) : savedMeals.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            No saved recipes yet — tap the ♡ on a meal in your plan to save it here.
          </Text>
        </View>
      ) : (
        savedMeals.map((meal) => (
          <View key={meal.id} style={styles.savedCard}>
            <Pressable onPress={() => toggleSaved(meal.id)} hitSlop={8}>
              <HeartIcon size={18} color="#e0245e" />
            </Pressable>
            <Pressable
              style={styles.savedInfo}
              onPress={() => router.push({ pathname: '/recipe', params: { id: meal.id } })}
            >
              <Text style={styles.savedName}>{meal.name}</Text>
              <Text style={styles.savedMeta}>
                ${meal.price.toFixed(2)} / serving · {meal.minutes} min
              </Text>
            </Pressable>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Companion recipes</Text>
      {!isSubscribed ? (
        <UpgradeCta reason="browse companion recipes" />
      ) : subRecipesLoading ? (
        <ActivityIndicator size="small" color="#111" style={styles.loadingIndicator} />
      ) : subRecipes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No companion recipes yet.</Text>
        </View>
      ) : (
        <View style={styles.subRecipesList}>
          {subRecipes.map((subRecipe) => (
            <SubRecipeCard
              key={subRecipe.title}
              subRecipe={subRecipe}
              expanded={isSubRecipeExpanded(subRecipe.title)}
              onToggle={() => toggleSubRecipe(subRecipe.title)}
            />
          ))}
        </View>
      )}
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1, backgroundColor: '#FFEAD4' },
  container: { padding: 24, paddingTop: 64, gap: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  sectionTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', marginTop: 8 },
  sectionHint: { fontSize: 13, color: '#888', marginTop: -8 },
  loadingIndicator: { marginTop: 8 },
  emptyState: { backgroundColor: '#F2F2F2', borderRadius: 14, padding: 16, gap: 10 },
  emptyStateText: { color: '#666', fontSize: 14 },
  smallLinkButton: { alignSelf: 'flex-start' },
  smallLinkButtonText: { color: '#111', fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', textDecorationLine: 'underline' },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  storeAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeAvatarText: { color: '#fff', fontWeight: '700', fontFamily: 'OpenSans_700Bold', fontSize: 13 },
  storeInfo: { flex: 1 },
  storeName: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  storeSubtitle: { fontSize: 12, color: '#888', marginTop: 1 },
  savedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  savedInfo: { flex: 1 },
  savedName: { fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  savedMeta: { fontSize: 13, color: '#888', marginTop: 2 },
  subRecipesList: { gap: 12 },
  membershipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: ACCENT,
    borderRadius: 14,
    padding: 14,
  },
  membershipExpiredCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: INK,
    borderRadius: 14,
    padding: 14,
  },
  membershipTextBlock: { flex: 1 },
  membershipTitle: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  membershipSubtitle: { fontSize: 12, color: '#5c3d1c', marginTop: 2 },
  membershipTitleLight: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: '#fff' },
  membershipSubtitleLight: { fontSize: 12, color: '#ccc', marginTop: 2 },
});
