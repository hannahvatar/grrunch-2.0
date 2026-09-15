import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronRightIcon, XMarkIcon } from 'react-native-heroicons/outline';

const SECTIONS = [
  'About',
  'How it works',
  'Get support',
  'Privacy',
  'Legal',
];

// Settings — pushed from Profile's gear icon. Drill-down list (tap a row,
// push its own screen), matching the iOS/Android Settings convention,
// rather than expanding in place -- inline accordion was tried and
// reverted (Anabelle's call, 2026-08-28: not the right pattern for a
// native Settings menu, and made Manage account's real form cramped).
//
// Manage account/Payment/Notifications moved out entirely (Anabelle,
// 2026-09-15: "Manage my account, Payment and notification should be
// moved to the profile page") -- Profile's own Membership/My stores
// accordion pattern now covers all of it: Manage account and
// Notifications became new accordion sections there
// (app/(tabs)/profile.tsx), and Payment was dropped rather than
// duplicated -- payment.tsx was already just Profile's own
// MembershipStatus component with nothing else on the screen. Every
// remaining row here has real content: "About" lands on the shared
// settings-detail.tsx (title="About" special-cases in real copy
// there); everything else is its own dedicated screen: get-support.tsx
// (real FAQ + email-support composer, also reached via
// SupportBubble.tsx's floating chat icon), privacy-policy.tsx/legal.tsx
// (the same real Privacy Policy/Terms of Use shown on index.tsx's
// first-run consent screen), how-it-works.tsx (the deal-tag reference
// table, Anabelle's call 2026-08-28 -- "a very important section").
export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        {/* Tertiary closing button, same treatment as the /upgrade modal's
            close control (white fill, INK border). */}
        <Pressable style={styles.closeButton} onPress={() => router.back()} hitSlop={8}>
          <XMarkIcon size={18} color="#111" />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {SECTIONS.map((section) => (
          <Pressable
            key={section}
            style={styles.row}
            onPress={() => {
              if (section === 'Get support') {
                router.push('/get-support');
              } else if (section === 'How it works') {
                router.push('/how-it-works');
              } else if (section === 'Privacy') {
                router.push('/privacy-policy');
              } else if (section === 'Legal') {
                router.push('/legal');
              } else {
                router.push({ pathname: '/settings-detail', params: { title: section } });
              }
            }}
          >
            <Text style={styles.rowText}>{section}</Text>
            <ChevronRightIcon size={16} color="#111" />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // GRRUNCH DS peach background, matches profile.tsx/meals.tsx/login.tsx.
  container: { flex: 1, backgroundColor: '#FFEAD4' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 60,
  },
  // Same tertiary treatment as profile.tsx's settingsButton (white fill,
  // 1.5px INK border), ellipse (borderRadius: 999).
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#111',
    paddingVertical: 16,
  },
  rowText: { fontSize: 15, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold' },
});
