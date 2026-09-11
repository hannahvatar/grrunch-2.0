import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { XMarkIcon } from 'react-native-heroicons/outline';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ACCENT = '#FFA955';
const INK = '#111';

export interface StatusAction {
  label: string;
  variant?: 'primary' | 'secondary' | 'text';
  onPress?: () => void;
}

// Shared layout for full-screen status states reached from auth flows
// (error.tsx, offline.tsx, no-account.tsx, etc.): X close button, circled
// icon, title, body, and one or more action buttons. Presented as a modal
// by the screens that use it.
//
// `actions` defaults to a single "Try again" -> router.back(), matching
// the original single-button screens. Pass an array for screens that need
// 2-3 actions (e.g. "Try another method" / "Recover account" / "Contact
// support") -- the first action defaults to 'primary' styling and the
// rest to 'secondary' unless a variant is given explicitly.
export function StatusScreen({
  icon,
  title,
  body,
  footnote,
  actions,
  onBack,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  footnote?: string;
  actions?: StatusAction[];
  onBack?: () => void;
}) {
  const resolvedActions: StatusAction[] = actions ?? [{ label: 'Try again' }];
  // A modal push already insets its own content below the status bar, but
  // this screen can also be the very first thing rendered -- a cold app
  // launch straight onto /error, which is exactly what DeepLinkErrorRedirect
  // (app/_layout.tsx) produces for someone tapping an expired magic link
  // when the app wasn't already running. There's no modal chrome to inset
  // it in that case, so a hardcoded `top` landed the close button under the
  // status bar/notch (real repro, Anabelle, 2026-09-10). insets.top is 0
  // when a parent already accounts for the safe area, so this is safe to
  // add unconditionally rather than only in the cold-start case.
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.backButton, { top: insets.top + 20 }]}
        onPress={onBack ?? (() => router.back())}
        hitSlop={8}
      >
        <XMarkIcon size={18} color={INK} />
      </Pressable>
      <View style={styles.content}>
        <View style={styles.iconCircle}>{icon}</View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
      <View style={styles.footer}>
        {resolvedActions.map((action, index) => {
          const variant = action.variant ?? (index === 0 ? 'primary' : 'secondary');
          const onPress = action.onPress ?? (() => router.back());
          if (variant === 'text') {
            return (
              <Pressable key={action.label} style={styles.textButton} onPress={onPress}>
                <Text style={styles.textButtonLabel}>{action.label}</Text>
              </Pressable>
            );
          }
          return (
            <Pressable
              key={action.label}
              style={variant === 'primary' ? styles.primaryButton : styles.secondaryButton}
              onPress={onPress}
            >
              <Text
                style={variant === 'primary' ? styles.primaryButtonText : styles.secondaryButtonText}
              >
                {action.label}
              </Text>
            </Pressable>
          );
        })}
        {footnote && <Text style={styles.footnote}>{footnote}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // GRRUNCH DS peach, matches every other modal in the app (upgrade.tsx,
  // signup-nudge.tsx, etc.) -- was plain white, matching nothing else.
  // justifyContent:'center' centers content+footer together as one
  // group (Anabelle's call) -- was content's own flex:1 pushing the
  // buttons all the way down to the screen's bottom edge, same fix as
  // signup-nudge.tsx's own container/content split.
  container: { flex: 1, backgroundColor: '#FFEAD4', justifyContent: 'center' },
  // White-fill/1.5px-INK-border tertiary circle -- same convention as
  // upgrade.tsx's own closeButton/recipe.tsx's closeButton/settings.tsx's
  // closeButton, instead of a bare unstyled chevron. XMarkIcon, not
  // ChevronLeftIcon (Anabelle's call: "the closing button we usually
  // use"), top-right like every other X close button in the app -- onPress
  // still just calls onBack ?? router.back(), unchanged.
  backButton: {
    position: 'absolute',
    // top is set inline, above -- see the insets.top comment there.
    right: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { alignItems: 'center', padding: 32 },
  // White fill, no border -- same "softer than a locked/denied state"
  // reasoning as upgrade.tsx's own iconCircle (that bordered treatment is
  // reserved for an actually-gated feature, e.g. MealCard's
  // groceryToggleButtonLocked); every screen sharing this component is
  // reporting a status, not blocking a specific paid feature.
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'OpenSans_800ExtraBold',
    marginBottom: 12,
    textAlign: 'center',
    color: INK,
  },
  // Black (Anabelle's call), not the app's more common #343837 muted
  // body-copy grey.
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', color: INK },
  footer: { padding: 24, gap: 12 },
  // Real btn-primary-orange -- see login.tsx's own primaryButton for the
  // canonical spec (ACCENT fill, 2px INK border, 28px pill, 56pt tall).
  // Was a flat black/14px-radius button, matching nothing else in the
  // app (same fix upgrade.tsx's own primaryButton already got).
  primaryButton: {
    height: 56,
    justifyContent: 'center',
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 28,
    alignItems: 'center',
  },
  primaryButtonText: { color: INK, fontSize: 17, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  // Tertiary pill -- same white-fill/INK-border shape as primaryButton
  // above (same height/radius, so a stacked primary+secondary pair reads
  // as one consistent group), just unfilled instead of ACCENT.
  secondaryButton: {
    height: 56,
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 28,
    alignItems: 'center',
  },
  secondaryButtonText: { color: INK, fontSize: 17, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  textButton: { alignItems: 'center', paddingVertical: 6 },
  textButtonLabel: { color: '#767676', fontSize: 14, textDecorationLine: 'underline' },
  footnote: { fontSize: 12, color: '#999', textAlign: 'center', marginTop: -2 },
});
