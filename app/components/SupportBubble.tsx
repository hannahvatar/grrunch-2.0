import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { ChatBubbleOvalLeftEllipsisIcon } from 'react-native-heroicons/solid';

// Rendered once, in the root layout, so it floats over every screen in the
// app -- not just reachable from Settings > Get support. Same destination
// as that row (get-support.tsx, real FAQ + email-support composer -- no
// live chat, which would need a 3rd-party provider not set up yet).
// Solid black fill/white icon -- Anabelle tried the white/INK-border
// tertiary treatment and reverted, preferred the original black.
export function SupportBubble() {
  return (
    <Pressable style={styles.bubble} onPress={() => router.push('/get-support')} hitSlop={8}>
      <ChatBubbleOvalLeftEllipsisIcon size={24} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    right: 20,
    bottom: 96,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
});
