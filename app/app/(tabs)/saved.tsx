import { ScrollView, StyleSheet, Text, View } from 'react-native';

// Saved Recipes — architecture.md section 2.3.
// Static snapshots (name, ingredients, macros) frozen at save time; not
// linked to curated_deals or product_url, so prices here are stale/informational
// only. Re-adding a saved recipe re-prices it fresh against the current week.
// Saving requires an account — this is the natural, motivated signup moment
// (see Step 0 in section 2.2), not a signup wall on first launch.

export default function SavedRecipesScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Saved recipes</Text>
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>
          Sign in to save recipes from a generated meal plan.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  emptyState: {
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F2F2F2',
  },
  emptyStateText: { color: '#666' },
});
