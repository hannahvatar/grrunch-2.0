import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  BuildingStorefrontIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Cog6ToothIcon,
  LockClosedIcon,
  PencilIcon,
} from 'react-native-heroicons/outline';
import { HeartIcon } from 'react-native-heroicons/solid';

import { MembershipStatus } from '../../components/MembershipStatus';
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

// Membership / My stores / Saved recipes / Companion recipes are each
// collapsible (Anabelle, 2026-08-27: "should probably be accordions" --
// collapsed by default, independent of each other, not a strict
// single-open accordion; Membership joined the rest 2026-09-11, having
// briefly been the one section kept always-visible). Distinct from
// Companion recipes' own EXISTING per-item accordion (SubRecipeCard,
// isSubRecipeExpanded/toggleSubRecipe below) -- this is a second, outer
// level of collapse on top of that one, for the whole section.
function SectionHeader({
  title,
  subtitle,
  expanded,
  onToggle,
}: {
  title: string;
  subtitle?: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <View>
      {/* subtitle sits with the heading itself, not inside the collapsible
          content below -- Anabelle's call, stays visible whether the
          section is open or closed. */}
      <Pressable style={styles.sectionHeaderRow} onPress={onToggle} hitSlop={8}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {expanded ? <ChevronUpIcon size={18} color={INK} /> : <ChevronDownIcon size={18} color={INK} />}
      </Pressable>
      {subtitle && <Text style={styles.sectionHint}>{subtitle}</Text>}
    </View>
  );
}

// No wireframe exists for this page yet (Anabelle, 2026-08-26: "design
// it yourself"). Built out so far: Membership, My stores, Saved
// recipes, Companion recipes -- all real data, no mocked content.
// Grocery list access lives in its own tab (app/(tabs)/grocery.tsx).
export default function ProfileScreen() {
  const { savedIds, toggleSaved } = useSavedRecipes();
  const [savedMeals, setSavedMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);

  const { stores: myStores, loaded: storesLoaded } = useSelectedStores();
  const { isSubscribed } = useSubscription();
  const { isGuest } = useAuth();

  // Collapsed by default (Anabelle's call) -- each toggles independently,
  // not a strict single-open accordion.
  const [membershipOpen, setMembershipOpen] = useState(false);
  const [storesOpen, setStoresOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [companionOpen, setCompanionOpen] = useState(false);

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
      <View style={styles.headerRow}>
        <Text style={styles.title}>Profile</Text>
        <Pressable style={styles.settingsButton} onPress={() => router.push('/settings')} hitSlop={8}>
          <Cog6ToothIcon size={20} color={INK} />
        </Pressable>
      </View>

      {!isGuest && (
        <>
          <SectionHeader
            title="Membership"
            expanded={membershipOpen}
            onToggle={() => setMembershipOpen((v) => !v)}
          />
          {membershipOpen && (
            // Real status card -- extracted to components/MembershipStatus.tsx
            // so payment.tsx (Settings > Payment) can show the exact same
            // logic instead of a second, drift-prone copy of it.
            <MembershipStatus />
          )}
        </>
      )}

      {!isGuest && <View style={styles.sectionDivider} />}
      <SectionHeader
        title="My stores"
        subtitle={!isSubscribed ? 'Auto-selected from your location' : undefined}
        expanded={storesOpen}
        onToggle={() => setStoresOpen((v) => !v)}
      />
      {storesOpen && (
      <>
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
        // Same card design as the onboarding "Stores near you" screen
        // (app/stores.tsx) -- offset-shadow card, BuildingStorefrontIcon
        // avatars, border-bottom row separators -- reused here per
        // Anabelle's call so the two screens showing the same kind of
        // content (a store list) actually look like the same app.
        <View style={styles.storesCardOuter}>
          <View style={styles.storesCardShadow} />
          <View style={styles.storesCard}>
            {myStores.map((store) => (
              <View key={store.id} style={styles.storeRow}>
                <View style={styles.storeAvatar}>
                  <BuildingStorefrontIcon size={26} color={INK} />
                </View>
                <View style={styles.storeInfo}>
                  <Text style={styles.storeName}>{store.name}</Text>
                  <Text style={styles.storeSubtitle}>{store.subtitle}</Text>
                </View>
                {/* Next-to-feature treatment (Anabelle's call, replaces
                    the single "Upgrade to customize" button above the
                    list) -- every member-only feature gets its own
                    inline, stroked (outline, not filled) button, sitting
                    right next to the feature it gates, instead of one
                    banner-style upsell for the whole section.
                    Anabelle, 2026-09-08: this now actually branches by
                    tier, since there's still no manual store-search UI
                    (same gap nearest-stores/index.ts's own comments
                    flag) to let a member swap just this one row for a
                    specific replacement -- a subscriber instead re-runs
                    the same location -> stores flow onboarding itself
                    uses, picking a fresh nearby-stores list that
                    replaces the whole selection at once (not a true
                    per-row edit, but a real, working path instead of
                    the paywall a paying member used to get bounced
                    to). Free tier keeps the old behavior -- store
                    editing genuinely is member-only, so /upgrade is the
                    correct destination for them. */}
                <Pressable
                  style={styles.changeStoreButton}
                  onPress={() =>
                    isSubscribed
                      ? router.push('/location')
                      : router.push({ pathname: '/upgrade', params: { reason: 'change your stores' } })
                  }
                >
                  {isSubscribed ? (
                    <PencilIcon size={13} color={INK} />
                  ) : (
                    <LockClosedIcon size={13} color={INK} />
                  )}
                  <Text style={styles.changeStoreButtonText}>Change</Text>
                </Pressable>
              </View>
            ))}
            {/* Last line of the store card -- member-only upsell, same
                next-to-feature language as the per-row Change buttons
                above (Anabelle's mockup: title + subtitle on the left,
                solid black pill on the right). Only the free tier sees
                it; a real member already has this. This row (like the
                rest of this card) is gated on !isSubscribed, not isGuest,
                so a signed-in-but-unsubscribed member sees it too, not
                just a true guest -- "Subscribe" (2026-09-11, was briefly
                "Sign up") is deliberate: this routes to /upgrade, a real
                paid-trial action, not account creation, and reads
                correctly either way -- unlike "Sign up", which was
                confusing for someone who already has an account (see
                AppTopBar.tsx/AccountBanner.tsx for where "Sign up"
                correctly means creating one, and MembershipStatus.tsx's
                own "Subscribe" button for the same wording used there). */}
            {!isSubscribed && (
              <Pressable
                style={[styles.storeRow, styles.storeRowLast]}
                onPress={() => router.push({ pathname: '/upgrade', params: { reason: 'choose your own stores' } })}
              >
                <View style={styles.storeInfo}>
                  <Text style={styles.storeName}>Choose your own stores</Text>
                  <Text style={styles.storeSubtitle}>Subscribers can swap any location.</Text>
                </View>
                <View style={styles.upgradeRowButton}>
                  <Text style={styles.upgradeRowButtonText}>Subscribe</Text>
                </View>
              </Pressable>
            )}
          </View>
        </View>
      )}
      </>
      )}

      <View style={styles.sectionDivider} />
      <SectionHeader
        title="Saved recipes"
        subtitle="Recipes you've saved to cook again"
        expanded={savedOpen}
        onToggle={() => setSavedOpen((v) => !v)}
      />
      {savedOpen && (
      <>
      {!isSubscribed ? (
        <UpgradeCta reason="save recipes" variant="outline" />
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
      </>
      )}

      <View style={styles.sectionDivider} />
      <SectionHeader
        title="Companion recipes"
        subtitle="Techniques and sides that pair with your meals"
        expanded={companionOpen}
        onToggle={() => setCompanionOpen((v) => !v)}
      />
      {companionOpen && (
      <>
      {!isSubscribed ? (
        <UpgradeCta reason="browse companion recipes" variant="outline" />
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
      </>
      )}
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1, backgroundColor: '#FFEAD4' },
  // paddingTop was 64 (clearing the status bar) -- the new persistent
  // AppTopBar ((tabs)/_layout.tsx) handles that now. Kept as its own
  // larger value (Anabelle's call), not folded back into the shared 24,
  // for clear breathing room between the white nav bar and this screen's
  // own heading below it.
  container: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24, gap: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  // Same tertiary treatment as IngredientRow's editButton / GroceryListView's
  // resetAllButton (white fill, 1.5px INK border) -- Anabelle's call, was a
  // bare icon with just hitSlop before. Ellipse (Anabelle's follow-up call,
  // for consistency with settings.tsx's own closeButton, which uses the
  // same tertiary treatment as an ellipse).
  settingsButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  sectionTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  sectionHint: { fontSize: 13, color: INK, marginTop: 6 },
  // Between accordion sections only (My stores / Saved recipes / Companion
  // recipes) -- not before My stores itself, since Membership above it
  // isn't one of these collapsible sections.
  sectionDivider: { height: 1, backgroundColor: INK, marginTop: 12 },
  loadingIndicator: { marginTop: 8 },
  emptyState: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10 },
  emptyStateText: { color: '#666', fontSize: 14 },
  smallLinkButton: { alignSelf: 'flex-start' },
  smallLinkButtonText: { color: '#111', fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', textDecorationLine: 'underline' },
  // Same offset-shadow card technique as app/stores.tsx's listCardOuter/
  // listCardShadow/listCard -- a flat black shadow layer behind a white,
  // INK-bordered card on top.
  storesCardOuter: { marginTop: 4 },
  storesCardShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    borderRadius: 24,
    transform: [{ translateX: -1 }, { translateY: 1 }],
  },
  storesCard: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 24,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#343837',
    paddingVertical: 14,
    gap: 12,
  },
  storeRowLast: { borderBottomWidth: 0 },
  storeAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeInfo: { flex: 1 },
  storeName: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  storeSubtitle: { fontSize: 13, color: '#888' },
  // Next-to-feature member-only button -- stroked/outline (white fill,
  // 1.5px dashed INK border), leading lock icon, pill shape.
  changeStoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: INK,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  changeStoreButtonText: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  // Real btn-primary-orange -- see the DS's canonical spec on login.tsx's
  // primaryButton (ACCENT fill, 2px INK border). Distinct from the Change
  // buttons' stroked/outline style since this row is the section's one
  // real conversion action, not a per-item locked-feature marker.
  upgradeRowButton: {
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  upgradeRowButtonText: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
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
});
