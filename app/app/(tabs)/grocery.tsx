import { GroceryListView } from '../../components/GroceryListView';

// Grocery list as its own tab. Meals' "Add to my grocery list" button
// navigates here directly instead of opening a modal.
export default function GroceryTabScreen() {
  return <GroceryListView />;
}
