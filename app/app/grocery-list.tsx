import { router } from 'expo-router';

import { GroceryListView } from '../components/GroceryListView';

// Guest-mode wireframe step 7 — Grocery list, presented as a modal sheet
// over the Meals tab (unchanged: still opened via Meals' "View grocery
// list" button). Also available as its own full page via the Grocery tab
// (app/(tabs)/grocery.tsx) — both render GroceryListView.
export default function GroceryListScreen() {
  return <GroceryListView onClose={() => router.back()} />;
}
