import { StyleSheet, Text, View } from 'react-native';

// Not yet detailed in the wireframes — placeholder tab.
export default function BestDealsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Best Deals</Text>
      <Text style={styles.body}>Not yet detailed in the wireframes.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 64, gap: 8 },
  title: { fontSize: 24, fontWeight: '800' },
  body: { fontSize: 14, color: '#888' },
});
