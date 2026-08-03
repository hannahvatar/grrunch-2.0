import { createContext, ReactNode, useContext, useState } from 'react';

export interface PlanTargets {
  maxCalories?: number;
  minProtein?: number;
}

interface PlanTargetsContextValue {
  targets: PlanTargets;
  setTargets: (targets: PlanTargets) => void;
}

const PlanTargetsContext = createContext<PlanTargetsContextValue | undefined>(undefined);

// The Plan screen's calorie/protein sliders, shared with Meals, the recipe
// detail modal, and the grocery list -- so a recipe's derived serving size
// (see lib/mealScaling.ts) stays the same wherever it's shown, not just on
// the screen where the sliders live.
export function PlanTargetsProvider({ children }: { children: ReactNode }) {
  const [targets, setTargets] = useState<PlanTargets>({});
  return (
    <PlanTargetsContext.Provider value={{ targets, setTargets }}>
      {children}
    </PlanTargetsContext.Provider>
  );
}

export function usePlanTargets(): PlanTargetsContextValue {
  const ctx = useContext(PlanTargetsContext);
  if (!ctx) {
    throw new Error('usePlanTargets must be used within a PlanTargetsProvider');
  }
  return ctx;
}
