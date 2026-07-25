import { router } from 'expo-router';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';

// Step 2 — Meal generation — architecture.md section 2.2.
// AI proposes meals from two combined pools: this week's approved
// curated_deals at the selected stores, and the maintained cheap-staples
// list. User reviews the proposed meals and can request a swap (regenerate
// one meal under the same constraints). If criteria can't be met this week
// (e.g. budget target unreachable), show an honest empty state rather than
// silently degrading quality (section 5, resolved open question #5).

export default function MealsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>This week's meals</Text>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>
          Generated meals will render here (name, ingredients, sourced deal
          ids, swap action per meal).
        </Text>
      </View>
      <Button title="Build grocery list" onPress={() => router.push('/plan/grocery-list')} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  placeholder: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F2F2F2',
  },
  placeholderText: { color: '#666' },
});
