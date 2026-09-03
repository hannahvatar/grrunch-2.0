import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GrrunchMascot } from '../components/GrrunchMascot';
import { LegalDocumentModal } from '../components/LegalDocumentModal';
import { PRIVACY_POLICY_EFFECTIVE_DATE, PRIVACY_POLICY_INTRO, PRIVACY_POLICY_SECTIONS } from '../lib/privacyPolicy';
import { TERMS_OF_USE_EFFECTIVE_DATE, TERMS_OF_USE_INTRO, TERMS_OF_USE_OUTRO, TERMS_OF_USE_SECTIONS } from '../lib/termsOfUse';

// GRRUNCH DS accent -- matches login.tsx's palette.
const ACCENT = '#FFA955';
const INK = '#111';

// Guest-mode wireframe step 2 — Terms & consent. Was app/index.tsx (the very
// first screen) until the onboarding carousel (see index.tsx) was inserted
// ahead of it on 2026-09-03 -- moved here unchanged, only the route/file
// name and this comment changed.
export default function TermsScreen() {
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  function decline() {
    Alert.alert('Terms required', 'You need to agree to the terms to use Grrunch.');
  }

  return (
    <LinearGradient colors={['#fff', '#FFEAD4']} style={styles.gradient}>
      <View style={styles.container}>
        {/* ScrollView, not a fixed-height flex-centered View -- the
            paragraph + mascot don't reliably fit above the pinned button
            block on a short device (found live, 2026-09-03: text was
            silently clipping behind the "I agree" button). flexGrow:1 on
            contentContainerStyle keeps it centered when it fits, scrolls
            when it doesn't. */}
        <ScrollView contentContainerStyle={styles.middle} showsVerticalScrollIndicator={false}>
          <View style={styles.logo}>
            <GrrunchMascot size={200} />
          </View>
          <Text style={styles.title}>Grrunch</Text>
          <Text style={styles.tagline}>Turns weekly deals into affordable meals</Text>
          <Text style={styles.body}>
            By continuing, you agree to our{' '}
            <Text style={styles.link} onPress={() => setShowTerms(true)}>
              Terms of Use
            </Text>{' '}
            and{' '}
            <Text style={styles.link} onPress={() => setShowPrivacy(true)}>
              Privacy Policy
            </Text>
            . We collect information to provide and improve Grrunch, including showing deals,
            building grocery lists, and enhancing your experience.
          </Text>
        </ScrollView>

        {/* pinned via its own paddingBottom, not flex centering, so both
            buttons always clear SupportBubble's fixed right:20/bottom:96,
            52px footprint -- found live while adding the onboarding
            carousel ahead of this screen (2026-09-03), same bug class as
            the paddingBottom fix on GroceryListView's Total card. */}
        <View style={styles.bottomBlock}>
          <Pressable
            onPress={() => router.push('/login')}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          >
            <Text style={styles.primaryButtonText}>I agree</Text>
          </Pressable>
          <Pressable style={styles.declineButton} onPress={decline}>
            <Text style={styles.declineText}>Decline</Text>
          </Pressable>
        </View>
      </View>

      <LegalDocumentModal
        visible={showTerms}
        onClose={() => setShowTerms(false)}
        title="Terms of Use"
        effectiveDate={TERMS_OF_USE_EFFECTIVE_DATE}
        intro={TERMS_OF_USE_INTRO}
        sections={TERMS_OF_USE_SECTIONS}
        outro={TERMS_OF_USE_OUTRO}
        showCloseButton
      />
      <LegalDocumentModal
        visible={showPrivacy}
        onClose={() => setShowPrivacy(false)}
        title="Privacy Policy"
        effectiveDate={PRIVACY_POLICY_EFFECTIVE_DATE}
        intro={PRIVACY_POLICY_INTRO}
        sections={PRIVACY_POLICY_SECTIONS}
        showCloseButton
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1, padding: 24 },
  middle: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  bottomBlock: { paddingBottom: 160 },
  logo: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    fontFamily: 'OpenSans_800ExtraBold',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'OpenSans_700Bold',
    textAlign: 'center',
    color: '#343837',
    marginBottom: 16,
  },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', color: '#343837' },
  link: { fontWeight: '700', fontFamily: 'OpenSans_700Bold', textDecorationLine: 'underline', color: INK },
  primaryButton: {
    width: '100%',
    height: 56,
    justifyContent: 'center',
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 28,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButtonPressed: { borderColor: INK },
  primaryButtonText: { color: INK, fontSize: 17, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  declineButton: {
    width: '100%',
    height: 56,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 28,
    alignItems: 'center',
  },
  declineText: { color: INK, fontSize: 15, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold' },
});
