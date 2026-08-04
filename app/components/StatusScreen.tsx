import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeftIcon } from 'react-native-heroicons/outline';

export interface StatusAction {
  label: string;
  variant?: 'primary' | 'secondary' | 'text';
  onPress?: () => void;
}

// Shared layout for full-screen status states reached from auth flows
// (error.tsx, offline.tsx, no-account.tsx, etc.): back chevron, circled
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

  return (
    <View style={styles.container}>
      <View style={styles.handle} />
      <Pressable
        style={styles.backButton}
        onPress={onBack ?? (() => router.back())}
        hitSlop={8}
      >
        <ChevronLeftIcon size={24} color="#111" />
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
  container: { flex: 1, backgroundColor: '#fff' },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginTop: 8,
  },
  backButton: { position: 'absolute', top: 24, left: 20 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: { fontSize: 20, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', marginBottom: 8, textAlign: 'center' },
  body: { fontSize: 15, color: '#666', textAlign: 'center' },
  footer: { padding: 24, gap: 12 },
  primaryButton: {
    backgroundColor: '#111',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#111', fontSize: 17, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  textButton: { alignItems: 'center', paddingVertical: 6 },
  textButtonLabel: { color: '#666', fontSize: 15, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold' },
  footnote: { fontSize: 12, color: '#999', textAlign: 'center', marginTop: -2 },
});
