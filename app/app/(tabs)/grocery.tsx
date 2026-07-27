import { GroceryListView } from '../../components/GroceryListView';

// Grocery list as its own tab — full page, no modal chrome, always visible
// without an extra tap. The Meals tab's "View grocery list" button still
// opens the same content as a modal separately (app/grocery-list.tsx).
export default function GroceryTabScreen() {
  return <GroceryListView />;
}
