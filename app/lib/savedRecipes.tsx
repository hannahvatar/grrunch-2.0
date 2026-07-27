import { createContext, ReactNode, useContext, useState } from 'react';

// Saved-recipe state shared between the Meals tab (where you tap the heart)
// and Profile (where saved recipes show) -- local-only for now, matching
// the rest of guest mode (no backend wiring yet). architecture.md 2.3 notes
// saving a recipe is normally the sign-up prompt for a guest; that gating
// isn't part of this pass, just the save/unsave + display mechanism.
interface SavedRecipesContextValue {
  savedIds: Set<string>;
  toggleSaved: (id: string) => void;
}

const SavedRecipesContext = createContext<SavedRecipesContextValue | undefined>(undefined);

export function SavedRecipesProvider({ children }: { children: ReactNode }) {
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  function toggleSaved(id: string) {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <SavedRecipesContext.Provider value={{ savedIds, toggleSaved }}>
      {children}
    </SavedRecipesContext.Provider>
  );
}

export function useSavedRecipes(): SavedRecipesContextValue {
  const ctx = useContext(SavedRecipesContext);
  if (!ctx) {
    throw new Error('useSavedRecipes must be used within a SavedRecipesProvider');
  }
  return ctx;
}
