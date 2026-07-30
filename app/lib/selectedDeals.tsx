import { createContext, ReactNode, useContext, useState } from 'react';

// Standalone curated_deals items the user has added straight from Best
// Deals (not tied to any recipe) -- shared with the grocery list, same
// pattern as selectedMeals.tsx.
interface SelectedDealsContextValue {
  selectedDealIds: Set<string>;
  toggleDealSelected: (id: string) => void;
}

const SelectedDealsContext = createContext<SelectedDealsContextValue | undefined>(undefined);

export function SelectedDealsProvider({ children }: { children: ReactNode }) {
  const [selectedDealIds, setSelectedDealIds] = useState<Set<string>>(new Set());

  function toggleDealSelected(id: string) {
    setSelectedDealIds((prev) => {
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
    <SelectedDealsContext.Provider value={{ selectedDealIds, toggleDealSelected }}>
      {children}
    </SelectedDealsContext.Provider>
  );
}

export function useSelectedDeals(): SelectedDealsContextValue {
  const ctx = useContext(SelectedDealsContext);
  if (!ctx) {
    throw new Error('useSelectedDeals must be used within a SelectedDealsProvider');
  }
  return ctx;
}
