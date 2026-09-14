import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

export interface SelectedStore {
  id: string;
  initial: string;
  name: string;
  subtitle: string;
  // The specific location's real coordinates -- added 2026-09-14 for
  // lib/dealZones.ts's nearestZoneForChain(), which needs a real point to
  // match against a chain's zone anchors (e.g. telling a Burnaby Real
  // Canadian Superstore apart from one outside the urban-zone flyer).
  // Optional: a store persisted before this field existed has neither,
  // and simply isn't zone-matched (same as before -- no regression, just
  // no new filtering for that one row until the user re-picks it).
  lat?: number;
  lng?: number;
  // True once the user has removed this store from Profile > My stores
  // (Anabelle, 2026-09-14: "for the user to remove one or more stores
  // from their stores list... Once a store is removed, it should appear
  // disabled and an add back button should be there to add it back").
  // A removed store stays in this array (never spliced out) so "Add
  // back" can restore it without re-running the picker -- undefined/
  // false means active, same as every store before this field existed.
  removed?: boolean;
}

const STORAGE_KEY = 'grrunch:selectedStores';

interface SelectedStoresContextValue {
  stores: SelectedStore[];
  loaded: boolean;
  setStores: (stores: SelectedStore[]) => void;
}

const SelectedStoresContext = createContext<SelectedStoresContextValue | undefined>(undefined);

// The stores confirmed during onboarding (see app/stores.tsx), persisted
// locally so Profile > My stores can show them later without re-fetching
// the nearest-stores Edge Function or asking for location access again.
// Free tier can't edit this list (see lib/subscription.tsx isSubscribed) --
// it's display-only until the user is on a Grrunch Plus trial/membership.
export function SelectedStoresProvider({ children }: { children: ReactNode }) {
  const [stores, setStoresState] = useState<SelectedStore[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setStoresState(JSON.parse(raw));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  function setStores(next: SelectedStore[]) {
    setStoresState(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }

  return (
    <SelectedStoresContext.Provider value={{ stores, loaded, setStores }}>
      {children}
    </SelectedStoresContext.Provider>
  );
}

export function useSelectedStores(): SelectedStoresContextValue {
  const ctx = useContext(SelectedStoresContext);
  if (!ctx) {
    throw new Error('useSelectedStores must be used within a SelectedStoresProvider');
  }
  return ctx;
}
