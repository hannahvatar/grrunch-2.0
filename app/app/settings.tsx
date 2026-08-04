import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronLeftIcon, ChevronRightIcon } from 'react-native-heroicons/outline';

const SECTIONS = ['Manage account', 'Payment', 'Notifications', 'Get support', 'Privacy', 'Legal'];

// Settings — pushed from Profile's gear icon. None of these have real
// content yet (no auth, no payments, no notification prefs, no support
// system), so each row goes to a shared "not built yet" stub
// (settings-detail.tsx) -- the navigation itself is real, even though the
// destinations aren't, rather than dead, unwired list items.
export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={8}>
          <ChevronLeftIcon size={18} color="#111" />
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {SECTIONS.map((section) => (
          <Pressable
            key={section}
            style={styles.row}
            onPress={() => router.push({ pathname: '/settings-detail', params: { title: section } })}
          >
            <Text style={styles.rowText}>{section}</Text>
            <ChevronRightIcon size={16} color="#ccc" />
          </Pressable>
        ))}
      </ScrollView>
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
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 16,
  },
  rowText: { fontSize: 15, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold' },
});
