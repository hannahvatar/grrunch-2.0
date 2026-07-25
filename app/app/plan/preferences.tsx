import { router } from 'expo-router';
import { Button, ScrollView, StyleSheet, Text } from 'react-native';

// Cost vs. diversity slider — architecture.md section 2.2, `cost_diversity_slider`.
// 1 = cheapest/most repetitive (leans hard into cheap staples), 10 = most
// variety at a higher price-per-meal. Default should sit low/cost-leaning,
// not centered — cost-consciousness is the core value prop. When the value
// is low, the app must visibly disclose thinner protein/vegetable portions
// (honesty disclosure, section 1 mission framing) rather than presenting the
// plan as nutritionally complete.

const DEFAULT_SLIDER_VALUE = 3;

export default function PreferencesScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Cost vs. variety</Text>
      <Text style={styles.body}>
        Slider default: {DEFAULT_SLIDER_VALUE}/10 (cost-leaning). Shows live
        price-per-meal as it moves. Low values trigger an honesty disclosure
        about thinner portions.
      </Text>
      <Button title="Generate meals" onPress={() => router.push('/plan/meals')} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 14, color: '#666', lineHeight: 20 },
});
