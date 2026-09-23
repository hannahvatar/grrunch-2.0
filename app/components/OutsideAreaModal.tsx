import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text } from 'react-native';

import { useAuth } from '../lib/auth';
import { isValidEmail, joinWaitlist, WaitlistSource } from '../lib/waitlist';
import { InputField } from './InputField';

const ACCENT = '#FFA955';
const INK = '#111';

interface OutsideAreaModalProps {
  visible: boolean;
  onClose: () => void;
  // "Already in BC? Try your location again" -- the caller closes this
  // and re-runs its own location check.
  onRetryLocation: () => void;
  source: WaitlistSource;
  // Where the device said they were, if that's what placed them outside
  // BC -- stored rounded on the waitlist row (see lib/waitlist.ts).
  coords?: { lat: number; lng: number } | null;
  // 'email' skips straight to the email field -- for the subscribe
  // screen, whose own "Join the waitlist" button already said the intro.
  initialStep?: 'intro' | 'email';
}

// Shown when someone's location or postal code lands outside British
// Columbia (Anabelle, 2026-09-23: "I'd like this to display as a modal
// and not an error message") -- replaces the red "BC only" banner the
// onboarding location step used to show. Copy is Anabelle's, verbatim.
//
// Three steps in one card: the message -> an email field once "Join the
// waitlist" is tapped (pre-filled for a signed-in account) -> "You're on
// the list". Same backdrop + centered white/INK-border card as
// ManageAccountSection.tsx's confirmation modals.
export function OutsideAreaModal({
  visible,
  onClose,
  onRetryLocation,
  source,
  coords,
  initialStep = 'intro',
}: OutsideAreaModalProps) {
  const { session } = useAuth();
  const [step, setStep] = useState<'intro' | 'email' | 'joined'>('intro');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  // Fresh card every time it opens -- a second open (after "Try your
  // location again" still came back outside BC) shouldn't land on a
  // stale email step or success message.
  useEffect(() => {
    if (visible) {
      setStep(initialStep);
      setEmail(session?.user.email ?? '');
      setEmailError(undefined);
    }
  }, [visible, initialStep, session?.user.email]);

  async function handleJoin() {
    if (!isValidEmail(email)) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setEmailError(undefined);
    setSubmitting(true);
    const { error } = await joinWaitlist({ email, source, userId: session?.user.id, coords });
    setSubmitting(false);
    if (error) {
      setEmailError("Couldn't join the waitlist. Please try again.");
      return;
    }
    setStep('joined');
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {step === 'joined' ? (
            <>
              <Text style={styles.title}>You're on the list</Text>
              <Text style={styles.body}>We'll let you know when Grrunch becomes available in your area.</Text>
              <Pressable style={styles.primaryButton} onPress={onClose}>
                <Text style={styles.primaryButtonText}>Got it</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>Grrunch isn’t in your area yet</Text>
              <Text style={styles.body}>
                We’re currently available in British Columbia, but we’re working on bringing Grrunch to the rest of
                Canada.
              </Text>
              <Text style={styles.body}>
                <Text style={styles.bold}>Join the waitlist</Text> and we’ll let you know when Grrunch becomes
                available in your area.
              </Text>
              {step === 'email' && (
                <InputField
                  placeholder="Email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoFocus={!email}
                  error={emailError}
                  onSubmitEditing={handleJoin}
                  returnKeyType="send"
                />
              )}
              <Pressable
                style={styles.primaryButton}
                onPress={step === 'intro' ? () => setStep('email') : handleJoin}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={INK} />
                ) : (
                  <Text style={styles.primaryButtonText}>Join the waitlist</Text>
                )}
              </Pressable>
              <Text style={styles.retryLine}>
                Already in BC?{' '}
                <Text style={styles.retryLink} onPress={onRetryLocation} suppressHighlighting>
                  Try your location again
                </Text>
              </Text>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 20,
    padding: 24,
    gap: 12,
  },
  title: { fontSize: 20, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  body: { fontSize: 15, lineHeight: 21, color: INK },
  bold: { fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  // Real btn-primary-orange, same spec as location.tsx's primaryButton.
  primaryButton: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 28,
    marginTop: 4,
  },
  primaryButtonText: { color: INK, fontSize: 17, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  retryLine: { fontSize: 15, color: INK, textAlign: 'center' },
  retryLink: { fontWeight: '700', fontFamily: 'OpenSans_700Bold', textDecorationLine: 'underline' },
});
