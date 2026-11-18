import { usePathname } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { WrenchScrewdriverIcon } from 'react-native-heroicons/outline';

import { useIsAdmin } from '../lib/admin';
import { SUPPORT_EMAIL } from '../lib/support';

// Grrunch is on pause (Anabelle, 2026-11-18). While this is true, everyone
// sees the maintenance page instead of the app, except admins
// (public.admins), who still get the whole app incl. dev-deals and
// dev-recipes. Set to false to bring the app back.
export const MAINTENANCE_MODE = true;

// Pages that stay open so an admin can sign in (and so the legal and
// support pages still load). Everything else is covered for non-admins.
const OPEN_PATHS = ['/login', '/error', '/offline', '/no-account', '/terms', '/privacy-policy', '/legal', '/get-support'];

const INK = '#111';

// Drawn on top of the app rather than in place of it, so the router keeps
// running underneath (signing in still redirects normally).
export function MaintenanceGate() {
  const pathname = usePathname();
  const isAdmin = useIsAdmin();

  if (!MAINTENANCE_MODE) return null;
  if (OPEN_PATHS.includes(pathname)) return null;
  if (isAdmin === true) return null;
  // Signed-in check still running: plain cover, no flash of either page.
  if (isAdmin === 'loading') return <View style={styles.cover} />;

  return (
    <View style={styles.cover}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <WrenchScrewdriverIcon size={32} color={INK} />
        </View>
        <Text style={styles.title}>Grrunch is taking a break</Text>
        <Text style={styles.body}>We're pausing for now. Thanks for checking in, we'll be back soon.</Text>
        {SUPPORT_EMAIL && (
          <Pressable onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} hitSlop={8}>
            <Text style={styles.link}>Questions? {SUPPORT_EMAIL}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Same peach as StatusScreen. zIndex keeps it above the support bubble
  // and cookie banner.
  cover: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    backgroundColor: '#FFEAD4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: { alignItems: 'center', padding: 32, maxWidth: 480 },
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
  body: { fontSize: 16, lineHeight: 24, textAlign: 'center', color: INK, marginBottom: 16 },
  link: { fontSize: 16, color: INK, textDecorationLine: 'underline' },
});
