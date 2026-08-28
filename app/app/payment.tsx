import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { XMarkIcon } from 'react-native-heroicons/outline';

import { MembershipStatus } from '../components/MembershipStatus';
import { SignInOrTrialPrompt } from '../components/SignInOrTrialPrompt';
import { useAuth } from '../lib/auth';

const INK = '#111';

// Its own screen (pushed from settings.tsx), not the shared settings-detail
// stub -- Payment is where subscription state actually lives, so it shows
// the real thing (MembershipStatus, the same component/logic backing
// Profile's Membership section) instead of a generic "not built yet" note.
// Guest state offers both real paths forward -- sign in (an existing
// account) or start a trial (routes through /login too, since a trial
// needs an account) -- Anabelle's mockup, 2026-08-28.
export default function PaymentScreen() {
  const { isGuest } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Payment</Text>
        <Pressable style={styles.closeButton} onPress={() => router.back()} hitSlop={8}>
          <XMarkIcon size={18} color={INK} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {isGuest ? <SignInOrTrialPrompt reason="manage payment" /> : <MembershipStatus />}
      </ScrollView>
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
});
