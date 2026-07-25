import { ScrollView, StyleSheet, Text, View } from 'react-native';

// Deal Browse — architecture.md section 2.4.
// Full "this week's deals" view, filterable by store/category, for users
// who want to look beyond the landing page's top highlights without going
// through the meal-planning flow.

export default function DealBrowseScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>This week's deals</Text>
      <Text style={styles.subtitle}>Filter by store and category (TODO)</Text>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>
          Deal list will render here, backed by `curated_deals`.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 14, color: '#666' },
  placeholder: {
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F2F2F2',
  },
  placeholderText: { color: '#666' },
});
