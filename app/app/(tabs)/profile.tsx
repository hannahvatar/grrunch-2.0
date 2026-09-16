import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  BuildingStorefrontIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Cog6ToothIcon,
  LockClosedIcon,
  PencilIcon,
} from 'react-native-heroicons/outline';

import { AlertBanner } from '../../components/AlertBanner';
import { ManageAccountSection } from '../../components/ManageAccountSection';
import { MembershipStatus } from '../../components/MembershipStatus';
import { NotificationsSection } from '../../components/NotificationsSection';
import { StoreSelectorModal } from '../../components/StoreSelectorModal';
import { useAuth } from '../../lib/auth';
import { type SelectedStore, useSelectedStores } from '../../lib/selectedStores';
import { useSubscription } from '../../lib/subscription';

// GRRUNCH DS -- matches login.tsx/index.tsx/location.tsx/stores.tsx/
// meals.tsx's palette. Missing here until now (Anabelle: "all i see and
// black and grey") -- this screen never picked up the app's actual
// peach background/orange accent, just plain white/grey/black.
const ACCENT = '#FFA955';
const INK = '#111';

// Membership / My stores are each collapsible (Anabelle, 2026-08-27:
// "should probably be accordions" -- collapsed by default, independent
// of each other, not a strict single-open accordion; Membership joined
// My stores 2026-09-11, having briefly been the one section kept
// always-visible).
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
// it yourself"). Built out so far: Membership, My stores, Manage
// account, Notifications -- all real data, no mocked content. Grocery
// list access lives in its own tab (app/(tabs)/grocery.tsx).
//
// Manage account and Notifications moved here from Settings (Anabelle,
// 2026-09-15: "Manage my account, Payment and notification should be
// moved to the profile page") -- same accordion pattern as Membership/
// My stores, rather than a separate pushed screen reached through the
// gear icon. Payment was NOT given its own section here: payment.tsx
// (the screen it used to live on) was already nothing but this same
// screen's own MembershipStatus component -- moving it would have
// meant a second, identical "Membership" section, not new content. The
// old manage-account.tsx/payment.tsx/notifications.tsx routes are
// deleted, not just unlinked -- confirmed via a repo-wide grep that
// nothing else referenced them.
//
// Notifications' own further nesting (a "Push notifications" row atop
// this already-collapsible section) got flattened same-day: "Dont nest
// Push notification into Notification. Make it Notification only" --
// see NotificationsSection.tsx, which now shows both push and email
// channels inline instead of drilling into two separate screens (now
// also deleted, same reasoning).
//
// Save/Favourite and the Companion recipes browse section were shelved
// here (Anabelle, 2026-09-15: "priorize going faster on the market
// versus multiplying the features... the main benefit of the app is
// novelty and those freshly deal-curated recipes brought every week.
// Saving recipes is a great add-on but not for a v01") -- the full
// working feature (heart-save on a meal card, Saved recipes/Companion
// recipes accordions here, the recipe page's generic/deal-free view for
// a saved recipe) is preserved at the `archive/saved-recipes-and-
// companion-v1` git tag for when this comes back. A single recipe's own
// companion/sub-recipe section (app/recipe.tsx) is untouched -- only
// this screen's member-only *browse-all* list of every companion recipe
// is gone.
export default function ProfileScreen() {
  const { stores: myStores, loaded: storesLoaded, setStores: setMyStores } = useSelectedStores();
  // The single "My stores" row currently open in the Select-a-Store picker
  // -- null when the modal is closed. Tracking the whole row (not just an
  // id) means onSelectStore below can always find its way back to the
  // right slot even if myStores itself has re-rendered with a new array
  // reference in the meantime.
  const [editingStore, setEditingStore] = useState<SelectedStore | null>(null);
  // Dismissible per screen visit, not persisted -- Anabelle, 2026-09-14:
  // "add a info banner at the top of my stores section that tell user
  // that advanced stores customization such as removing store will come
  // soon" (following the decision to hold off on store removal for v1 --
  // see the "keeping the recipe-generation scope simple" conversation
  // this banner's copy is paraphrasing). Not worth AsyncStorage-backed
  // "seen once" persistence for a temporary, low-stakes heads-up like
  // this -- reappearing next visit is fine.
  const [storesBannerDismissed, setStoresBannerDismissed] = useState(false);
  const { isSubscribed } = useSubscription();
  const { isGuest } = useAuth();

  // Collapsed by default (Anabelle's call) -- each toggles independently,
  // not a strict single-open accordion.
  const [membershipOpen, setMembershipOpen] = useState(false);
  const [storesOpen, setStoresOpen] = useState(false);
  const [manageAccountOpen, setManageAccountOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

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
      {isSubscribed && !storesBannerDismissed && (
        <AlertBanner
          variant="info"
          title="Advanced store customization coming soon"
          description="You can already change the location used for each store banner. Soon, you'll also be able to remove stores you don't want included. For now, all 5 stores remain active."
          onDismiss={() => setStoresBannerDismissed(true)}
          style={styles.storesInfoBanner}
        />
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
                    A subscriber now gets a real per-row picker
                    (StoreSelectorModal, 2026-09-14) -- browse/search
                    other locations of just THIS chain and swap only this
                    one slot, closing the gap flagged here up through
                    2026-09-08 (a subscriber used to have to re-run the
                    whole location -> stores onboarding flow, replacing
                    all 5 stores at once just to change one). Free tier
                    keeps the old behavior -- store editing genuinely is
                    member-only, so /upgrade is the correct destination
                    for them. */}
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

      {!isGuest && (
        <>
          <View style={styles.sectionDivider} />
          <SectionHeader
            title="Manage account"
            expanded={manageAccountOpen}
            onToggle={() => setManageAccountOpen((v) => !v)}
          />
          {/* ManageAccountSection carries its own Sign out/Delete account
              buttons (its "Security" sub-section) -- Profile no longer
              needs a separate standalone Sign out button now that this
              is here, so that one's removed rather than left duplicated. */}
          {manageAccountOpen && <ManageAccountSection />}

          <View style={styles.sectionDivider} />
          <SectionHeader
            title="Notifications"
            expanded={notificationsOpen}
            onToggle={() => setNotificationsOpen((v) => !v)}
          />
          {/* Anabelle, 2026-09-15: "Dont nest Push notification into
              Notification. Make it Notification only" -- was a two-row
              list (Push notifications/Email), each pushing its own
              dedicated screen (a real extra nesting level on top of the
              accordion this section already is). NotificationsSection
              now shows both channels inline, one combined Save -- same
              "no drill-down" treatment as this screen's own Manage
              account section. No guest branch needed here (unlike that
              component's own internal isGuest check, kept for when it's
              used standalone) -- this whole section is already hidden
              for a guest by the wrapping !isGuest above. */}
          {notificationsOpen && <NotificationsSection />}
        </>
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
  // Between accordion sections -- not before My stores itself, since
  // Membership above it isn't one of these collapsible sections.
  sectionDivider: { height: 1, backgroundColor: INK, marginTop: 12 },
  emptyState: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10 },
  emptyStateText: { color: '#666', fontSize: 14 },
  smallLinkButton: { alignSelf: 'flex-start' },
  smallLinkButtonText: { color: '#111', fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', textDecorationLine: 'underline' },
  // Same offset-shadow card technique as app/stores.tsx's listCardOuter/
  // listCardShadow/listCard -- a flat black shadow layer behind a white,
  // INK-bordered card on top.
  storesInfoBanner: { marginTop: 8, marginBottom: 4 },
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
});
