import { router } from 'expo-router';
import { Button, ScrollView, StyleSheet, Text } from 'react-native';

// Household builder — architecture.md section 2.2, `household_members`.
// One or more people, each with their own calorie/macro targets and
// exclusions. Exclusions are combined (union) across the household and
// applied to every shared meal; targets are summed/averaged to size
// portions. Meals stay one shared dish per slot in MVP (no per-person
// separate meals).

export default function HouseholdScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Who are you shopping for?</Text>
      <Text style={styles.body}>
        Add each household member with their own calorie/macro targets and
        exclusions (allergies, diet). Exclusions are combined across everyone.
      </Text>
      <Button title="Next: Cost vs. variety" onPress={() => router.push('/plan/preferences')} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 14, color: '#666', lineHeight: 20 },
});
