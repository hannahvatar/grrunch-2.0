import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeftIcon } from 'react-native-heroicons/outline';

// Shared stub destination for every Settings row, and for the persistent
// support bubble (both land here with title="Get support"). None of these
// sections have real content yet (no auth, no payments, no notification
// prefs, no support system), so this is one honest "not built yet" screen
// rather than six fabricated ones.
export default function SettingsDetailScreen() {
  const { title } = useLocalSearchParams<{ title?: string }>();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={8}>
          <ChevronLeftIcon size={18} color="#111" />
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>{title ?? 'Settings'}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.body}>
        <Text style={styles.bodyText}>This isn't available yet — check back soon.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 60,
  },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backButtonText: { fontSize: 16, color: '#111' },
  title: { fontSize: 18, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  headerSpacer: { width: 44 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  bodyText: { fontSize: 14, color: '#888', textAlign: 'center' },
});
