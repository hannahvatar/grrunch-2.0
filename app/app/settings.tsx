import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronRightIcon, XMarkIcon } from 'react-native-heroicons/outline';

const SECTIONS = [
  'About',
  'How it works',
  'Manage account',
  'Payment',
  'Notifications',
  'Get support',
  'Privacy',
  'Legal',
];

// Settings — pushed from Profile's gear icon. Drill-down list (tap a row,
// push its own screen), matching the iOS/Android Settings convention,
// rather than expanding in place -- inline accordion was tried and
// reverted (Anabelle's call, 2026-08-28: not the right pattern for a
// native Settings menu, and made Manage account's real form cramped).
// Every row now has real content. "About" still lands on the shared
// settings-detail.tsx (title="About" special-cases in real copy there);
// everything else is its own dedicated screen: manage-account.tsx (real
// auth/profile data), payment.tsx (real subscription status, same
// MembershipStatus component Profile's Membership section uses),
// notifications.tsx (real notification_prefs, from a reference
// screenshot), get-support.tsx (real FAQ + email-support composer, also
// reached via SupportBubble.tsx's floating chat icon),
// privacy-policy.tsx/legal.tsx (the same real Privacy Policy/Terms of Use
// shown on index.tsx's first-run consent screen), how-it-works.tsx (the
// deal-tag reference table, Anabelle's call 2026-08-28 -- "a very
// important section").
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
              if (section === 'Manage account') {
                router.push('/manage-account');
              } else if (section === 'Payment') {
                router.push('/payment');
              } else if (section === 'Notifications') {
                router.push('/notifications');
              } else if (section === 'Get support') {
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
