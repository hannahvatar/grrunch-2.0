import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  BuildingStorefrontIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Cog6ToothIcon,
  LockClosedIcon,
  PencilIcon,
  TrashIcon,
} from 'react-native-heroicons/outline';
import { HeartIcon } from 'react-native-heroicons/solid';

import { MembershipStatus } from '../../components/MembershipStatus';
import { StoreSelectorModal } from '../../components/StoreSelectorModal';
import { SubRecipeCard } from '../../components/SubRecipeCard';
import { UpgradeCta } from '../../components/UpgradeCta';
import { useAuth } from '../../lib/auth';
import type { Meal, SubRecipe } from '../../lib/mealData';
import { fetchRecipesByIds } from '../../lib/recipes';
import { useSavedRecipes } from '../../lib/savedRecipes';
import { type SelectedStore, useSelectedStores } from '../../lib/selectedStores';
import { supabase } from '../../lib/supabase';
import { fetchSubRecipes } from '../../lib/subRecipes';
import { useSubscription } from '../../lib/subscription';

// GRRUNCH DS -- matches login.tsx/index.tsx/location.tsx/stores.tsx/
// meals.tsx's palette. Missing here until now (Anabelle: "all i see and
// black and grey") -- this screen never picked up the app's actual
// peach background/orange accent, just plain white/grey/black.
const ACCENT = '#FFA955';
const INK = '#111';
// Matches MembershipStatus.tsx/ManageAccountSection.tsx's own ERROR
// const -- same red used for "Cancel trial"/"Delete account" there, now
// this screen's "Yes, delete store" too.
const ERROR = '#D0342C';

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

  const { stores: myStores, loaded: storesLoaded, setStores: setMyStores } = useSelectedStores();
  // The single "My stores" row currently open in the Select-a-Store picker
  // -- null when the modal is closed. Tracking the whole row (not just an
  // id) means onSelectStore below can always find its way back to the
  // right slot even if myStores itself has re-rendered with a new array
  // reference in the meantime.
  const [editingStore, setEditingStore] = useState<SelectedStore | null>(null);
  // The store pending a remove confirmation -- null when the modal is
  // closed. Anabelle, 2026-09-14: "add a garbage bin icon button next to
  // the pencil button. Pair it with a confirmation modal... keeping one
  // mandatory". Removing never deletes the row -- see SelectedStore's
  // own `removed` field comment -- so "Add back" can restore it later.
  const [deletingStore, setDeletingStore] = useState<SelectedStore | null>(null);
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
            {/* At least one store must stay active -- computed once
                against the whole list (not per-row) so removing the
                second-to-last active store correctly disables the
                remaining one's own trash button too, not just the one
                just removed. */}
            {(() => {
              const activeStoreCount = myStores.filter((s) => !s.removed).length;
              return myStores.map((store) => (
                <View key={store.id} style={styles.storeRow}>
                  <View style={[styles.storeAvatar, store.removed && styles.storeAvatarRemoved]}>
                    <BuildingStorefrontIcon size={26} color={store.removed ? '#999' : INK} />
                  </View>
                  <View style={styles.storeInfo}>
                    <Text style={[styles.storeName, store.removed && styles.storeNameRemoved]}>{store.name}</Text>
                    <Text style={styles.storeSubtitle}>{store.removed ? 'Removed' : store.subtitle}</Text>
                  </View>
                  {store.removed ? (
                    // Anabelle, 2026-09-14: "Once a store is removed, it
                    // should appear disabled and a add back button should
                    // be there to add it back" -- non-destructive, so no
                    // confirmation needed, unlike removing.
                    <Pressable
                      style={styles.addBackButton}
                      onPress={() => setMyStores(myStores.map((s) => (s.id === store.id ? { ...s, removed: false } : s)))}
                    >
                      <Text style={styles.addBackButtonText}>Add back</Text>
                    </Pressable>
                  ) : (
                    <View style={styles.storeRowActions}>
                      {/* Next-to-feature treatment (Anabelle's call,
                          replaces the single "Upgrade to customize"
                          button above the list) -- every member-only
                          feature gets its own inline, stroked (outline,
                          not filled) button, sitting right next to the
                          feature it gates, instead of one banner-style
                          upsell for the whole section.
                          A subscriber now gets a real per-row picker
                          (StoreSelectorModal, 2026-09-14) -- browse/
                          search other locations of just THIS chain and
                          swap only this one slot, closing the gap
                          flagged here up through 2026-09-08 (a
                          subscriber used to have to re-run the whole
                          location -> stores onboarding flow, replacing
                          all 5 stores at once just to change one). Free
                          tier keeps the old behavior -- store editing
                          genuinely is member-only, so /upgrade is the
                          correct destination for them. */}
                      <Pressable
                        style={styles.changeStoreButton}
                        onPress={() =>
                          isSubscribed
                            ? setEditingStore(store)
                            : router.push({ pathname: '/upgrade', params: { reason: 'change your stores' } })
                        }
                        accessibilityLabel="Change"
                        hitSlop={8}
                      >
                        {isSubscribed ? (
                          <PencilIcon size={15} color={INK} />
                        ) : (
                          <LockClosedIcon size={15} color={INK} />
                        )}
                      </Pressable>
                      {/* Member-only, same gate as Change -- free tier
                          can't remove a store any more than they can
                          swap one, so this simply doesn't render rather
                          than showing a second lock icon next to
                          Change's own. Hidden (not just disabled) on the
                          one remaining active store -- "keeping one
                          mandatory" -- rather than letting the confirm
                          modal open just to fail. */}
                      {isSubscribed && activeStoreCount > 1 && (
                        <Pressable
                          style={styles.deleteStoreButton}
                          onPress={() => setDeletingStore(store)}
                          accessibilityLabel="Remove"
                          hitSlop={8}
                        >
                          <TrashIcon size={15} color={INK} />
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              ));
            })()}
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

      {/* Real supabase.auth.signOut() -- same call ManageAccountSection.tsx
          already uses (reachable today via Settings > Manage account),
          now also directly on Profile itself so it doesn't take a detour
          through Settings to find. Tertiary pill -- same white-fill/
          1.5px-INK-border convention as signup-nudge.tsx's own
          tertiaryButton, not a destructive-red one: signing out isn't
          data loss, just ending the session. */}
      {!isGuest && (
        <Pressable style={styles.signOutButton} onPress={() => supabase.auth.signOut()}>
          <Text style={styles.signOutButtonText}>Sign out</Text>
        </Pressable>
      )}
    </ScrollView>
      {editingStore && (
        <StoreSelectorModal
          visible={!!editingStore}
          onClose={() => setEditingStore(null)}
          chainName={editingStore.name}
          currentStoreId={editingStore.id}
          onSelectStore={(result) => {
            const chosen: SelectedStore = {
              id: result.id,
              initial: editingStore.initial,
              name: editingStore.name,
              subtitle: result.address,
              lat: result.lat,
              lng: result.lng,
            };
            setMyStores(myStores.map((s) => (s.id === editingStore.id ? chosen : s)));
          }}
        />
      )}
      {/* Same plain-Modal/centered-card pattern as LegalDocumentModal.tsx
          -- a native Alert.alert can't give "Yes, delete store"/"Keep it"
          their own real button styling (destructive-outline vs. filled-
          primary), which is specifically what Anabelle asked for here. */}
      <Modal visible={!!deletingStore} transparent animationType="fade" onRequestClose={() => setDeletingStore(null)}>
        <Pressable style={styles.confirmBackdrop} onPress={() => setDeletingStore(null)}>
          <View style={styles.confirmCardWrap}>
            <View pointerEvents="none" style={styles.confirmCardShadow} />
            <Pressable style={styles.confirmCard} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.confirmTitle}>Remove {deletingStore?.name}?</Text>
              <Text style={styles.confirmBody}>
                You won't see deals or pricing from this store anymore. You can add it back anytime.
              </Text>
              <View style={styles.confirmActions}>
                <Pressable style={styles.confirmKeepButton} onPress={() => setDeletingStore(null)}>
                  <Text style={styles.confirmKeepButtonText}>Keep it</Text>
                </Pressable>
                <Pressable
                  style={styles.confirmDeleteButton}
                  onPress={() => {
                    setMyStores(myStores.map((s) => (s.id === deletingStore?.id ? { ...s, removed: true } : s)));
                    setDeletingStore(null);
                  }}
                >
                  <Text style={styles.confirmDeleteButtonText}>Yes, delete store</Text>
                </Pressable>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
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
  // Muted, not hidden -- Anabelle, 2026-09-14: a removed store "should
  // appear disabled", still readable (so "Add back" means something)
  // rather than collapsing to a bare row.
  storeAvatarRemoved: { backgroundColor: '#F2F2F2' },
  storeNameRemoved: { color: '#999' },
  storeRowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Next-to-feature member-only button -- stroked/outline (white fill,
  // 1.5px solid INK border -- was dashed, Anabelle 2026-09-14), icon
  // only now (the "Change" text label was removed same day) -- a fixed-
  // size circle instead of a text pill, accessibilityLabel carries the
  // same "Change" wording for screen readers.
  changeStoreButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 16,
  },
  // Same icon-only-circle shape as changeStoreButton, right next to it
  // (Anabelle, 2026-09-14: "add a garbage bin icon button next to the
  // pencil button") -- plain INK/white, not red: the row itself isn't
  // "dangerous" to look at, the confirmation modal is where the real
  // destructive styling (ERROR) actually shows up.
  deleteStoreButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 16,
  },
  // Real btn-primary-orange (matches upgradeRowButton below) -- restoring
  // a removed store is a positive action, not a lesser-emphasis one, so
  // it gets the same filled-pill treatment as the section's other real
  // conversion action instead of changeStoreButton's stroked-outline look.
  addBackButton: {
    backgroundColor: ACCENT,
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  addBackButtonText: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
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
  // Same shape/height/radius as signup-nudge.tsx's tertiaryButton --
  // white fill, 1.5px INK border, 56pt pill.
  signOutButton: {
    marginTop: 24,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 28,
  },
  signOutButtonText: { color: INK, fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  // Delete-store confirmation -- same centered-card/backdrop-press-to-
  // close/stopPropagation pattern as LegalDocumentModal.tsx, sized to
  // its own short content instead of that component's 80%-viewport card.
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,17,17,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  confirmCardWrap: { width: '100%', maxWidth: 360 },
  confirmCardShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    borderRadius: 24,
    transform: [{ translateX: -1 }, { translateY: 1 }],
  },
  confirmCard: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 24,
    padding: 20,
    gap: 12,
  },
  confirmTitle: { fontSize: 18, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  confirmBody: { fontSize: 14, lineHeight: 20, color: '#343837' },
  confirmActions: { gap: 10, marginTop: 8 },
  // Primary/safe action first and most prominent (ACCENT fill, matches
  // this screen's other real primary actions) -- Anabelle's own framing
  // ("a destructive style button that says yes, delete store. Or
  // another primary button that say keep it") puts "Keep it" as the
  // normal/default choice, "Yes, delete store" as the deliberate,
  // lesser-emphasis one right below it.
  confirmKeepButton: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 24,
  },
  confirmKeepButtonText: { color: INK, fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  // Same btn-secondary-destructive as MembershipStatus.tsx's own
  // cancelTrialButton -- white fill, 2px ERROR border, ERROR text.
  confirmDeleteButton: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: ERROR,
    borderRadius: 24,
  },
  confirmDeleteButtonText: { color: ERROR, fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
});
