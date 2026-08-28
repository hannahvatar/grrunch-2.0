import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRightIcon, XMarkIcon } from 'react-native-heroicons/outline';

import { SignInOrTrialPrompt } from '../components/SignInOrTrialPrompt';
import { useAuth } from '../lib/auth';

const INK = '#111';

// "Communication" landing screen (pushed from settings.tsx's Notifications
// row), matching a real reference screenshot (Anabelle, 2026-08-28) --
// two category groups, each its own screen with its own real Save
// (notifications-push.tsx / notifications-email.tsx), reading/writing
// public.users.notification_prefs (see lib/notificationPrefs.ts).
export default function NotificationsScreen() {
  const { isGuest } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Communication</Text>
        <Pressable style={styles.closeButton} onPress={() => router.back()} hitSlop={8}>
          <XMarkIcon size={18} color={INK} />
        </Pressable>
      </View>
      <View style={styles.content}>
        {isGuest ? (
          <SignInOrTrialPrompt reason="set your notification preferences" />
        ) : (
          <>
            <Text style={styles.heading}>Marketing preferences</Text>
            <Text style={styles.subtitle}>
              Choose how to get special offers, promos, personalized suggestions, and more.
            </Text>
            <Pressable style={styles.row} onPress={() => router.push('/notifications-push')}>
              <Text style={styles.rowText}>Push notifications</Text>
              <ChevronRightIcon size={16} color={INK} />
            </Pressable>
            <Pressable style={styles.row} onPress={() => router.push('/notifications-email')}>
              <Text style={styles.rowText}>Email</Text>
              <ChevronRightIcon size={16} color={INK} />
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // GRRUNCH DS peach background, matches settings.tsx/manage-account.tsx.
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
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  content: { paddingHorizontal: 24, paddingBottom: 40 },
  heading: { fontSize: 20, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK, marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 20 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: INK,
    paddingVertical: 16,
  },
  rowText: { fontSize: 15, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold', color: INK },
});
