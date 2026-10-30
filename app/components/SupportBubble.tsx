import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { ChatBubbleOvalLeftEllipsisIcon } from 'react-native-heroicons/solid';

import { useIsDesktop } from '../lib/layout';
import { isDesktopReadyRoute, TAB_ROUTES } from './WebFrame';

// Rendered once, in the root layout, so it floats over every screen in the
// app -- not just reachable from Settings > Get support. Same destination
// as that row (get-support.tsx, real FAQ + email-support composer -- no
// live chat, which would need a 3rd-party provider not set up yet).
// Solid black fill/white icon -- Anabelle tried the white/INK-border
// tertiary treatment and reverted, preferred the original black.
export function SupportBubble() {
  // Hidden on the dev-deals review screen, where it covered deal cards and
  // menus (Anabelle, 2026-09-30: "Its in the way"). Dev-only screen, so
  // shoppers never see the difference.
  const pathname = usePathname();
  const isDesktop = useIsDesktop();
  if (pathname.startsWith('/dev-deals')) return null;
  // Hidden on the onboarding slides too: it forced a 160 px gap under the
  // Next button there, which pushed the slide text out of view on a phone
  // (Anabelle, 2026-10-30). Help is a tap away on every other screen.
  if (pathname === '/') return null;
  // Desktop pages have no bottom tab bar to clear, so the bubble sits in
  // the window's corner instead of over the content column.
  const desktopCorner = isDesktop && (isDesktopReadyRoute(pathname) || TAB_ROUTES.has(pathname));
  return (
    <Pressable style={[styles.bubble, desktopCorner && styles.bubbleDesktop]} onPress={() => router.push('/get-support')} hitSlop={8}>
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
  bubbleDesktop: { right: 32, bottom: 32 },
});
