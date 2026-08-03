import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

export interface PersonalTargets {
  calories: number;
  protein: number;
}

const DEFAULT_TARGETS: PersonalTargets = { calories: 600, protein: 30 };
const STORAGE_KEY = 'grrunch:personalTargets';

interface PersonalTargetsContextValue {
  targets: PersonalTargets;
  // True once the persisted value (or the lack of one) has actually been
  // read from storage -- lets Plan wait for the real saved default before
  // pre-filling its sliders, instead of flashing the hardcoded default
  // first and then jumping.
  loaded: boolean;
  setTargets: (targets: PersonalTargets) => void;
}

const PersonalTargetsContext = createContext<PersonalTargetsContextValue | undefined>(undefined);

// The user's own saved default calorie/protein target, set on the Profile
// page's "Personal targets" section and persisted locally so it survives
// an app restart. Plan pre-fills its sliders from this instead of always
// resetting to a hardcoded 600 kcal/30g -- but adjusting Plan's sliders for
// a single session doesn't change this saved default; only explicitly
// saving from Profile does.
export function PersonalTargetsProvider({ children }: { children: ReactNode }) {
  const [targets, setTargetsState] = useState<PersonalTargets>(DEFAULT_TARGETS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setTargetsState(JSON.parse(raw));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  function setTargets(next: PersonalTargets) {
    setTargetsState(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }

  return (
    <PersonalTargetsContext.Provider value={{ targets, loaded, setTargets }}>
      {children}
    </PersonalTargetsContext.Provider>
  );
}

export function usePersonalTargets(): PersonalTargetsContextValue {
  const ctx = useContext(PersonalTargetsContext);
  if (!ctx) {
    throw new Error('usePersonalTargets must be used within a PersonalTargetsProvider');
  }
  return ctx;
}
