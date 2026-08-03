import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

export interface SelectedStore {
  id: string;
  initial: string;
  name: string;
  subtitle: string;
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
// Free tier can't edit this list (see lib/tier.ts storesEditable) -- it's
// display-only until a paid tier exists.
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
