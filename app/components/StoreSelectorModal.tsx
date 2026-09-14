import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MagnifyingGlassIcon, PaperAirplaneIcon, XMarkIcon } from 'react-native-heroicons/outline';
import { StarIcon as StarIconSolid } from 'react-native-heroicons/solid';

import { searchStoresByChain, type StoreSearchResult } from '../lib/storeSearch';

const ACCENT = '#FFA955';
const INK = '#111';
// Same "confirmation" green as MembershipStatus.tsx's Free-trial badge/
// MealCard's Added badge (#1E7B34/#E8F5E9) -- reused here for "Your
// preferred store" so the app has one consistent "this is the active one"
// color language, not a one-off green picked just for this screen.
const PREFERRED_GREEN = '#1E7B34';

// "Open . Closes at 6:00 PM" / "Open . Open 24 hours" / "Closed" / null
// (hours unknown) -- one place to turn search-stores' openNow+hoursText
// pair into the single display line, instead of nested ternaries in JSX.
function formatHoursLine(store: StoreSearchResult): string | null {
  if (!store.hoursText) return null;
  if (store.hoursText === 'Closed') return 'Closed';
  return `Open . ${store.hoursText}`;
}

interface StoreSelectorModalProps {
  visible: boolean;
  onClose: () => void;
  // The banner/chain being edited (e.g. "Safeway") -- every result in this
  // picker is a specific location of just this one chain, never a mix.
  chainName: string;
  // stores.id of the row currently assigned to this chain slot, so that
  // one result can be marked "Your preferred store" instead of showing a
  // redundant "Select this store" button for the store already selected.
  currentStoreId: string | null;
  onSelectStore: (store: StoreSearchResult) => void;
}

// Bottom-sheet "Select a Store" picker (Anabelle, 2026-09-14: "copy the
// store selection process from canadian tire and apply to our store") --
// opened from Profile > My stores' per-row Change button. Search by city
// or "use my location" both call search-stores/index.ts, which returns up
// to 8 real candidate locations for the one chain this picker was opened
// for (never a mix of chains) -- see that function's own header comment
// for exactly how city-vs-location search is prioritized.
//
// Same Modal/backdrop-press-to-close/stopPropagation pattern as
// LegalDocumentModal.tsx, just anchored to the bottom of the screen
// (rounded top corners, fixed max height) instead of a centered card --
// this app has no bottom-sheet library (no @gorhom/bottom-sheet), so this
// is built on the same plain RN Modal every other modal in the app uses.
export function StoreSelectorModal({ visible, onClose, chainName, currentStoreId, onSelectStore }: StoreSelectorModalProps) {
  const [query, setQuery] = useState('');
  const [stores, setStores] = useState<StoreSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState(false);
  // Distinct from a genuine "no <chain> found here" -- see search-stores/
  // index.ts's SERVICE_AREA_CENTER comment for what this actually means.
  const [outsideServiceArea, setOutsideServiceArea] = useState(false);

  async function runSearch(opts: { city?: string; lat?: number; lng?: number }) {
    setLoading(true);
    setError(false);
    setOutsideServiceArea(false);
    try {
      const result = await searchStoresByChain({ chainName, limit: 8, ...opts });
      setStores(result.stores);
      setOutsideServiceArea(result.outsideServiceArea);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  // On open: try a silent (no permission prompt) location-biased search
  // first -- only if permission was already granted earlier (e.g. during
  // onboarding's location.tsx). Otherwise falls back to a plain
  // chain-name-only search with no bias, rather than prompting for
  // location access just from opening the picker; "Use my location" below
  // is the explicit, user-initiated way to grant/request it.
  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setError(false);
    let cancelled = false;
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        try {
          const position = await Location.getCurrentPositionAsync({});
          if (!cancelled) {
            await runSearch({ lat: position.coords.latitude, lng: position.coords.longitude });
          }
          return;
        } catch {
          // Fall through to the unbiased search below.
        }
      }
      if (!cancelled) await runSearch({});
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, chainName]);

  function handleSearchCity() {
    const trimmed = query.trim();
    if (!trimmed) return;
    runSearch({ city: trimmed });
  }

  async function handleUseLocation() {
    setLocating(true);
    try {
      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          canAskAgain ? 'Location access needed' : 'Location access is turned off',
          canAskAgain ? 'Allow location access to find stores near you.' : 'Turn it on in Settings to find stores near you.'
        );
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      setQuery('');
      await runSearch({ lat: position.coords.latitude, lng: position.coords.longitude });
    } catch {
      Alert.alert("Couldn't get your location", 'Please try again.');
    } finally {
      setLocating(false);
    }
  }

  function handleSelect(store: StoreSearchResult) {
    onSelectStore(store);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text style={styles.title}>Select a Store</Text>
            <Pressable style={styles.closeButton} onPress={onClose} hitSlop={8}>
              <XMarkIcon size={20} color={INK} />
            </Pressable>
          </View>

          <View style={styles.searchRow}>
            <View style={styles.searchInputWrap}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search by city"
                placeholderTextColor="#888"
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={handleSearchCity}
                returnKeyType="search"
              />
              <Pressable onPress={handleSearchCity} hitSlop={8}>
                <MagnifyingGlassIcon size={20} color={INK} />
              </Pressable>
            </View>
            <Pressable style={styles.locateButton} onPress={handleUseLocation} disabled={locating} hitSlop={8}>
              {locating ? (
                <ActivityIndicator size="small" color={INK} />
              ) : (
                <PaperAirplaneIcon size={20} color={INK} />
              )}
            </Pressable>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {loading && (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color={INK} />
              </View>
            )}

            {!loading && error && (
              <View style={styles.centered}>
                <Text style={styles.errorText}>Couldn't load stores. Please try again.</Text>
              </View>
            )}

            {!loading && !error && stores.length === 0 && (
              <View style={styles.centered}>
                <Text style={styles.errorText}>
                  {outsideServiceArea
                    ? `We found ${chainName} locations there, but they're outside the area our deals currently cover. Deals and pricing are Metro Vancouver only for now.`
                    : `No ${chainName} locations found. Try a different city.`}
                </Text>
              </View>
            )}

            {!loading &&
              !error &&
              stores.map((store) => {
                const isPreferred = store.id === currentStoreId;
                const hoursLine = formatHoursLine(store);
                return (
                  <View key={store.id} style={styles.storeCard}>
                    {isPreferred && (
                      <View style={styles.preferredRow}>
                        <StarIconSolid size={16} color={PREFERRED_GREEN} />
                        <Text style={styles.preferredText}>Your preferred store</Text>
                      </View>
                    )}
                    <Text style={styles.storeCity}>{store.cityLabel ?? store.chainName}</Text>
                    {hoursLine && <Text style={styles.storeHours}>{hoursLine}</Text>}
                    <Pressable onPress={() => Linking.openURL(store.mapsUrl)}>
                      <Text style={[styles.storeAddress, isPreferred && styles.storeAddressPreferred]}>
                        {store.address}
                      </Text>
                    </Pressable>
                    {store.phone && (
                      <Pressable onPress={() => Linking.openURL(`tel:${store.phone}`)}>
                        <Text style={styles.storePhone}>{store.phone}</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => Linking.openURL(store.mapsUrl)}>
                      <Text style={styles.viewDetailsLink}>View store details</Text>
                    </Pressable>

                    {isPreferred ? (
                      <View style={styles.selectedPill}>
                        <Text style={styles.selectedPillText}>Selected</Text>
                      </View>
                    ) : (
                      <Pressable style={styles.selectButton} onPress={() => handleSelect(store)}>
                        <Text style={styles.selectButtonText}>Select this store</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,17,17,0.5)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '85%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 2,
    borderColor: INK,
    borderBottomWidth: 0,
    paddingBottom: 20,
  },
  grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#ddd', alignSelf: 'center', marginTop: 10 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  title: { fontSize: 20, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingBottom: 14 },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    borderWidth: 1.5,
    borderColor: '#ccc',
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontSize: 15, color: INK },
  locateButton: {
    width: 48,
    height: 48,
    borderWidth: 1.5,
    borderColor: '#ccc',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { flexGrow: 0 },
  listContent: { paddingHorizontal: 20, paddingBottom: 12, gap: 16 },
  centered: { paddingVertical: 40, alignItems: 'center' },
  errorText: { fontSize: 14, color: '#666', textAlign: 'center' },
  storeCard: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 16,
    gap: 4,
  },
  preferredRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  preferredText: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: PREFERRED_GREEN },
  storeCity: { fontSize: 17, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  storeHours: { fontSize: 13, color: '#666' },
  storeAddress: { fontSize: 14, color: INK, textDecorationLine: 'underline', marginTop: 4 },
  storeAddressPreferred: { color: PREFERRED_GREEN },
  storePhone: { fontSize: 14, color: INK },
  viewDetailsLink: { fontSize: 14, color: INK, textDecorationLine: 'underline' },
  selectedPill: {
    alignSelf: 'flex-start',
    backgroundColor: INK,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 10,
  },
  selectedPillText: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  selectButton: {
    alignSelf: 'flex-start',
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 10,
  },
  selectButtonText: { color: INK, fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
});
