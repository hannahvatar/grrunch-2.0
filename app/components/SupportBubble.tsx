import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

// Rendered once, in the root layout, so it floats over every screen in the
// app -- not just reachable from Settings > Get support. Same destination
// as that row (settings-detail.tsx), since neither has real support content
// yet.
export function SupportBubble() {
  return (
    <Pressable
      style={styles.bubble}
      onPress={() => router.push({ pathname: '/settings-detail', params: { title: 'Get support' } })}
      hitSlop={8}
    >
      <Text style={styles.icon}>💬</Text>
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
  icon: { fontSize: 22 },
});
