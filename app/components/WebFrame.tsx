import { usePathname } from 'expo-router';
import { ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

// Web-only stopgap while desktop layouts are built page by page
// (2026-10-22): screens without a desktop version yet live in one
// centered, phone-width column instead of stretching edge to edge. Once a
// screen has its own desktop layout, add its route to DESKTOP_READY so it
// gets the full window. Native is a passthrough.
const COLUMN_WIDTH = 480;

// Exact routes with a real desktop layout.
const DESKTOP_READY = new Set(['/', '/terms', '/login', '/location', '/stores']);

export function isDesktopReadyRoute(pathname: string): boolean {
  return DESKTOP_READY.has(pathname);
}

// Internal review tools keep the full window -- they're used on a laptop
// and want the room (dev-deals is reviewed on web).
const FULL_WIDTH_PREFIXES = ['/dev-deals', '/dev-recipes'];

export function WebFrame({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  if (Platform.OS !== 'web') return <>{children}</>;
  if (isDesktopReadyRoute(pathname)) return <>{children}</>;
  if (FULL_WIDTH_PREFIXES.some((p) => pathname.startsWith(p))) return <>{children}</>;
  const framed = width > COLUMN_WIDTH;
  return (
    <View style={[styles.backdrop, framed && styles.backdropFramed]}>
      <View style={[styles.column, framed && styles.columnFramed]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  backdropFramed: {
    backgroundColor: '#F6DEC3',
    alignItems: 'center',
  },
  column: {
    flex: 1,
    width: '100%',
  },
  columnFramed: {
    maxWidth: COLUMN_WIDTH,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
  },
});
