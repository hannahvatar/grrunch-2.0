import { router, usePathname } from 'expo-router';
import { Platform, Pressable, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';

import { setAnalyticsConsent, useAnalyticsConsent } from '../lib/analyticsConsent';
import { gridSpan, useIsDesktop } from '../lib/layout';

const ACCENT = '#FFA955';
const INK = '#111';

// The first-run flow (onboarding, terms, sign in, location, stores): no
// banner there. It shows once they reach the app itself, as the last thing
// to answer (Anabelle, 2026-10-27: "a lot" on top of the first onboarding
// screen). The Privacy Policy page stays open to it as well.
const FIRST_RUN_ROUTES = new Set(['/', '/terms', '/login', '/location', '/stores']);

const BANNER_TEXT =
  'We use analytics cookies to see how Grrunch is used and make it better. They stay off unless you accept.';

// Web cookie banner (Anabelle, 2026-10-26): shown until the visitor
// chooses, on every page after the first-run flow. Accept is orange (Anabelle,
// 2026-10-27); Decline stays a full-size button beside it, so declining
// is still one easy tap. Essential
// storage (sign-in, stores, list) doesn't need it; only PostHog
// analytics waits on the answer (lib/analyticsConsent.ts).
export function CookieConsentBanner() {
  const consent = useAnalyticsConsent();
  const isDesktop = useIsDesktop();
  const { width: windowWidth } = useWindowDimensions();
  const pathname = usePathname();
  if (Platform.OS !== 'web' || consent !== null || FIRST_RUN_ROUTES.has(pathname)) return null;
  // Desktop: centred, 6 of the 12 grid columns (Anabelle, 2026-10-27).
  const desktopWidth = gridSpan(windowWidth, 6);
  return (
    <View
      style={[
        styles.banner,
        isDesktop
          ? [styles.bannerDesktop, { width: desktopWidth, left: (windowWidth - desktopWidth) / 2 }]
          : styles.bannerPhone,
      ]}
      accessibilityRole="alert"
      accessibilityLabel="Cookie consent"
    >
      <Text style={styles.text}>
        {BANNER_TEXT}{' '}
        <Text style={styles.link} onPress={() => router.push('/privacy-policy')}>
          Privacy Policy
        </Text>
      </Text>
      <View style={styles.buttons}>
        <Pressable style={styles.button} onPress={() => setAnalyticsConsent('denied')}>
          <Text style={styles.buttonText}>Decline</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.acceptButton]} onPress={() => setAnalyticsConsent('granted')}>
          <Text style={styles.buttonText}>Accept</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Profile > Settings > Cookies (web only): change the banner's answer.
export function CookiePreferencesBody() {
  const consent = useAnalyticsConsent();
  return (
    <View style={styles.prefs}>
      <Text style={styles.prefsText}>
        Essential storage keeps you signed in and remembers your stores and list. It's always on. Analytics cookies
        help us see how Grrunch is used, and stay off unless you turn them on.
      </Text>
      <View style={styles.prefsRow}>
        <Text style={styles.prefsLabel}>Analytics cookies</Text>
        <Switch
          value={consent === 'granted'}
          onValueChange={(on) => setAnalyticsConsent(on ? 'granted' : 'denied')}
          // Same orange-track switch as Notifications.
          trackColor={{ false: '#ccc', true: ACCENT }}
          thumbColor="#fff"
          {...({ activeThumbColor: '#fff' } as object)}
          accessibilityLabel="Analytics cookies"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Above everything, including the support bubble.
  banner: {
    position: 'absolute',
    zIndex: 100,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.2)',
  },
  bannerDesktop: { bottom: 32 },
  // Above the phone tab bar.
  bannerPhone: { left: 12, right: 12, bottom: 84 },
  text: { fontSize: 16, lineHeight: 24, color: INK },
  link: { textDecorationLine: 'underline', fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  buttons: { flexDirection: 'row', gap: 12 },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButton: { backgroundColor: ACCENT },
  buttonText: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  prefs: { gap: 16 },
  prefsText: { fontSize: 16, lineHeight: 24, color: INK },
  prefsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  prefsLabel: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
});
