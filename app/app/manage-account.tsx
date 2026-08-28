import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { XMarkIcon } from 'react-native-heroicons/outline';

import { ManageAccountSection } from '../components/ManageAccountSection';

// Its own screen (pushed from settings.tsx), not an inline accordion --
// Manage account holds a real multi-field form plus destructive actions
// (sign out, delete account), which needs room and its own scroll/keyboard
// context rather than expanding inline in the Settings list (Anabelle's
// call, 2026-08-28).
export default function ManageAccountScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Manage account</Text>
        {/* Same tertiary closing treatment as settings.tsx's closeButton. */}
        <Pressable style={styles.closeButton} onPress={() => router.back()} hitSlop={8}>
          <XMarkIcon size={18} color="#111" />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <ManageAccountSection />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // GRRUNCH DS peach background, matches settings.tsx/profile.tsx.
  container: { flex: 1, backgroundColor: '#FFEAD4' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 60,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
});
