import { ScrollView, StyleSheet, Text, View } from 'react-native';

// Step 3/4 — Grocery list — architecture.md section 2.2.
// Ingredients consolidated across all chosen meals (deduped), pantry basics
// excluded by default and flagged separately as "you'll also need". Each
// item shows quantity, reference price, and cheapest selected store (sub-
// grouped by store within one consolidated list — resolved open question
// #4). Projected total price at the top; each item deep-links to the
// retailer's product page.

export default function GroceryListScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Projected total</Text>
        <Text style={styles.totalValue}>—</Text>
      </View>
      <Text style={styles.title}>Grocery list</Text>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>
          Consolidated, editable items grouped by store, each deep-linking to
          the retailer's product page.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  totalCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#E6F4FE',
  },
  totalLabel: { fontSize: 13, color: '#0A7EA4' },
  totalValue: { fontSize: 28, fontWeight: '700', color: '#0A7EA4' },
  title: { fontSize: 20, fontWeight: '700' },
  placeholder: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F2F2F2',
  },
  placeholderText: { color: '#666' },
});
