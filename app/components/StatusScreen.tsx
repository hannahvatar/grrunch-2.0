import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

// Shared layout for full-screen status states reached from auth flows (e.g.
// error.tsx, offline.tsx): back chevron, circled icon, title, body, and a
// primary action button. Presented as a modal by the screens that use it.
export function StatusScreen({
  icon,
  title,
  body,
  footnote,
  actionLabel = 'Try again',
  onBack,
  onAction,
}: {
  icon: string;
  title: string;
  body: string;
  footnote?: string;
  actionLabel?: string;
  onBack?: () => void;
  onAction?: () => void;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.handle} />
      <Pressable
        style={styles.backButton}
        onPress={onBack ?? (() => router.back())}
        hitSlop={8}
      >
        <Text style={styles.backButtonText}>‹</Text>
      </Pressable>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Text style={styles.icon}>{icon}</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
      <View style={styles.footer}>
        <Pressable style={styles.primaryButton} onPress={onAction ?? (() => router.back())}>
          <Text style={styles.primaryButtonText}>{actionLabel}</Text>
        </Pressable>
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
  backButtonText: { fontSize: 28, color: '#111' },
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
  icon: { fontSize: 24, color: '#999' },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  body: { fontSize: 15, color: '#666', textAlign: 'center' },
  footer: { padding: 24 },
  primaryButton: {
    backgroundColor: '#111',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  footnote: { fontSize: 12, color: '#999', textAlign: 'center', marginTop: 10 },
});
