import { router } from 'expo-router';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';

// Step 1 — Setup — architecture.md section 2.2.
// User selects up to 5 stores (of the 5 supported MVP chains) and a meal
// count (default 10, excludes snacks/breakfast). Continues into the
// household builder next.

const MVP_CHAINS = [
  'Save-On-Foods',
  'Real Canadian Superstore / No Frills',
  'Safeway',
  'T&T Supermarket',
  'Walmart',
];

export default function SetupScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Choose your stores</Text>
      <View style={styles.list}>
        {MVP_CHAINS.map((chain) => (
          <Text key={chain} style={styles.chain}>
            {chain}
          </Text>
        ))}
      </View>
      <Text style={styles.title}>Number of meals</Text>
      <Text style={styles.body}>Default 10 (paid tier) / 5 (free tier)</Text>
      <Button title="Next: Household" onPress={() => router.push('/plan/household')} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', marginTop: 8 },
  body: { fontSize: 14, color: '#666' },
  list: { gap: 4 },
  chain: { fontSize: 15, paddingVertical: 4 },
});
