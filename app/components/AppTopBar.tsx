import { router, usePathname } from 'expo-router';
import { ComponentType, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../lib/auth';
import { GRID_MARGIN, GRID_MAX_WIDTH, useIsDesktop } from '../lib/layout';
import { fetchProfile } from '../lib/profile';
import { GrrunchMascot } from './GrrunchMascot';
import { ListAltIcon, PersonIcon, RestaurantIcon, SellIcon } from './MaterialSymbols';
import { NotificationBell } from './NotificationBell';

const ACCENT = '#FFA955';
const INK = '#111';

// Persistent sticky top nav (Anabelle, 2026-09-08) -- lives in
// (tabs)/_layout.tsx, outside the <Tabs> navigator itself, so it's one
// single instance that never remounts/scrolls away as you switch between
// Meals/Weekly Deals/My list/Profile. Deliberately scoped to just the 4
// tabbed screens, not the whole app (onboarding/login/every modal already
// have their own close/back buttons -- a second bar there would clash,
// not help).
//
// Replaces AccountBanner on Meals/Profile (Anabelle's call) -- this is
// now the one place showing guest Sign in/Sign up or the signed-in
// profile shortcut, instead of that plus a second inline banner repeating
// the same auth actions further down the page.
//
// Desktop web (2026-10-22): becomes the app's main navigation, replacing
// the bottom tab bar (hidden in (tabs)/_layout.tsx): brand, then the 4 tabs
// as links, then the same auth actions on the right. Profile isn't one of
// the links: signed in, it's a "Hi, [first name]" button beside the
// notification bell (Anabelle, 2026-10-23); guests get a plain "Profile"
// button beside Sign in.
const NAV_LINKS: { path: string; label: string; Icon: ComponentType<{ size?: number; color?: string }> }[] = [
  { path: '/best-deals', label: 'Weekly Deals', Icon: SellIcon },
  { path: '/meals', label: 'Meals', Icon: RestaurantIcon },
  { path: '/grocery', label: 'My list', Icon: ListAltIcon },
];

// First name for the desktop greeting: the one saved in Manage account,
// else the given name the sign-in provider shared (Google does; Apple
// only on the very first sign-in), else none.
function useFirstName(): string | null {
  const { session } = useAuth();
  const [savedName, setSavedName] = useState<string | null>(null);
  const userId = session?.user.id;
  useEffect(() => {
    setSavedName(null);
    if (!userId) return;
    fetchProfile(userId).then(({ profile }) => setSavedName(profile?.firstName?.trim() || null));
  }, [userId]);
  const meta = session?.user.user_metadata ?? {};
  const providerName =
    (meta.given_name as string | undefined) ||
    ((meta.full_name ?? meta.name) as string | undefined)?.trim().split(/\s+/)[0];
  return savedName || providerName || null;
}

function ProfileButton({ label }: { label: string }) {
  const pathname = usePathname();
  const active = pathname === '/profile';
  return (
    <Pressable
      style={[styles.profilePill, active && styles.profilePillActive]}
      onPress={() => router.navigate('/profile')}
      accessibilityLabel="Profile"
    >
      <PersonIcon size={20} color={INK} />
      <Text style={styles.profilePillText}>{label}</Text>
    </Pressable>
  );
}

function AuthButtons() {
  return (
    <View style={styles.authButtons}>
      <Pressable
        style={styles.signInButton}
        onPress={() => router.push({ pathname: '/login', params: { mode: 'signin' } })}
        hitSlop={8}
      >
        <Text style={styles.signInText}>Sign in</Text>
      </Pressable>
      <Pressable
        style={styles.signUpButton}
        onPress={() => router.push({ pathname: '/login', params: { mode: 'signup' } })}
      >
        <Text style={styles.signUpText}>Sign up</Text>
      </Pressable>
    </View>
  );
}

function DesktopTopBar() {
  const { isGuest } = useAuth();
  const pathname = usePathname();
  const firstName = useFirstName();
  return (
    <View style={styles.desktopBar}>
      <View style={styles.desktopInner}>
        <View style={styles.desktopLeft}>
          <View style={styles.brand}>
            <GrrunchMascot size={44} showCrumbs={false} />
            <Text style={styles.wordmark}>GRRUNCH</Text>
          </View>
          <View style={styles.navLinks}>
            {NAV_LINKS.map(({ path, label, Icon }) => {
              const active = pathname === path;
              return (
                <Pressable key={path} style={styles.navLink} onPress={() => router.navigate(path as never)}>
                  <View style={styles.navLinkRow}>
                    <Icon size={20} color={active ? INK : '#767676'} />
                    <Text style={[styles.navLinkText, active && styles.navLinkTextActive]}>{label}</Text>
                  </View>
                  <View style={[styles.navUnderline, active && styles.navUnderlineActive]} />
                </Pressable>
              );
            })}
          </View>
        </View>
        {isGuest ? (
          <View style={styles.desktopRight}>
            <ProfileButton label="Profile" />
            <AuthButtons />
          </View>
        ) : (
          <View style={styles.desktopRight}>
            <NotificationBell />
            <ProfileButton label={firstName ? `Hi, ${firstName}!` : 'Hi there!'} />
          </View>
        )}
      </View>
    </View>
  );
}

export function AppTopBar() {
  const { isGuest } = useAuth();
  const isDesktop = useIsDesktop();
  if (isDesktop) return <DesktopTopBar />;

  return (
    <View style={styles.bar}>
      {/* No crumbs here (Anabelle's call) -- at this small size the
          floating dots outside the face read as stray specks, not a
          flourish. terms.tsx's big logo lockup keeps them (default on).
          52px (Anabelle, 2026-10-05; was 34) -- a touch bigger than the
          44pt bell and profile buttons on the right. */}
      <GrrunchMascot size={52} showCrumbs={false} />
      {isGuest ? (
        <View style={styles.authButtons}>
          {/* Same screen either way (login.tsx) -- Apple/Google/email all
              use one request to create or sign into an account, so
              there's no separate form to route to. mode just swaps that
              screen's headline copy so "Sign in" doesn't land on
              new-account-creation framing. */}
          <AuthButtons />
        </View>
      ) : (
        <View style={styles.signedInButtons}>
          <NotificationBell />
          {/* Same white-fill/1.5px-INK-border tertiary circle convention as
              settings.tsx's closeButton/recipe.tsx's closeButton -- routes
              straight into the existing Profile tab (group segments like
              "(tabs)" don't appear in the URL, so this is just '/profile',
              same pattern stores.tsx already uses for '/best-deals'). */}
          <Pressable style={styles.profileButton} onPress={() => router.push('/profile')} hitSlop={8}>
            <PersonIcon size={20} color={INK} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    // Trimmed from 12 (Anabelle's call: bar shouldn't be taller than the
    // Sign up button itself) -- paddingTop:60 above is still the fixed
    // status-bar clearance, untouched; this is just the visible strip's
    // own bottom breathing room, now snug around the row's tallest child
    // (the Sign up button, ~34px) instead of padding well past it.
    paddingBottom: 8,
    // White (Anabelle's call) -- was the shared peach ('#FFEAD4'), now a
    // plain white strip that sits above the peach page background.
    backgroundColor: '#fff',
    // Above the page below it so the notification dropdown isn't painted
    // over by the page on web (same as desktopBar).
    zIndex: 10,
  },
  desktopBar: {
    // Above the page below it, so the notification dropdown (which hangs
    // out of this bar) paints over the page instead of under it. On web
    // every view is its own stacking context, so the panel's own zIndex
    // can't escape the bar without this (Anabelle, 2026-10-23).
    zIndex: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0C9AE',
  },
  desktopInner: {
    width: '100%',
    maxWidth: GRID_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: GRID_MARGIN,
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  desktopLeft: { flexDirection: 'row', alignItems: 'center', gap: 48, height: '100%' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  wordmark: { fontSize: 22, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK, letterSpacing: 1 },
  navLinks: { flexDirection: 'row', alignItems: 'stretch', gap: 32, height: '100%' },
  navLink: { justifyContent: 'center', height: '100%' },
  navLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navLinkText: { fontSize: 16, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold', color: '#767676' },
  navLinkTextActive: { fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  // Active tab: ink bar along the bottom edge of the nav bar.
  navUnderline: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'transparent' },
  navUnderlineActive: { backgroundColor: INK },
  desktopRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  // Same white-fill / 1.5px ink outline as the mobile round profile button,
  // stretched into a pill to fit the greeting.
  profilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
  },
  profilePillActive: { borderWidth: 2.5 },
  profilePillText: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  authButtons: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  signedInButtons: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  signInButton: { paddingVertical: 6, paddingHorizontal: 4, minHeight: 44, justifyContent: 'center' },
  signInText: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  signUpButton: {
    backgroundColor: ACCENT,
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: 'center',
  },
  signUpText: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
