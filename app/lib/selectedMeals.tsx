import { createContext, ReactNode, useContext, useState } from 'react';

// Recipes the user has checked off in Meals to bring into their grocery
// list -- shared between the Meals tab (where you check the box) and the
// grocery list (modal + tab), same pattern as savedRecipes.tsx.
interface SelectedMealsContextValue {
  selectedIds: Set<string>;
  toggleSelected: (id: string) => void;
  // Empties the list -- used at the weekly close (components/
  // WeekLifecycle.tsx), when last week's recipes stop being available.
  clearSelected: () => void;
}

const SelectedMealsContext = createContext<SelectedMealsContextValue | undefined>(undefined);

export function SelectedMealsProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function clearSelected() {
    setSelectedIds(new Set());
  }

  return (
    <SelectedMealsContext.Provider value={{ selectedIds, toggleSelected, clearSelected }}>
      {children}
    </SelectedMealsContext.Provider>
  );
}

export function useSelectedMeals(): SelectedMealsContextValue {
  const ctx = useContext(SelectedMealsContext);
  if (!ctx) {
    throw new Error('useSelectedMeals must be used within a SelectedMealsProvider');
  }
  return ctx;
}
