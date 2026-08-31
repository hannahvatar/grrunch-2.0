import * as Location from 'expo-location';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowRightIcon, MapPinIcon, XMarkIcon } from 'react-native-heroicons/outline';

// GRRUNCH DS -- matches login.tsx/index.tsx's palette.
const ACCENT = '#FFA955';
const INK = '#111';

// Guest-mode wireframe step 3 — Location permission. Reachable more than
// once: also linked from Profile's "My stores" empty state
// (app/(tabs)/profile.tsx), so a guest who declined here can genuinely
// come back and turn it on later (Anabelle, 2026-08-28) -- not a one-shot
// ask that dead-ends.
//
// "Allow location access" requests real device location and forwards the
// coords to Stores. "Skip for now" pushes to Stores with no coords, which
// falls back to coarse IP geolocation or an honest no-location state (see
// nearest-stores/index.ts) -- there's no manual search UI (a real,
// deliberate gap, not being built), so this screen no longer claims one
// exists in its copy.
//
// iOS/Android won't re-show the system permission dialog once truly
// denied -- calling requestForegroundPermissionsAsync() again just
// silently returns 'denied' again. canAskAgain on the response is exactly
// how you tell "still askable" apart from "permanently denied, only
// Settings can fix it" (see expo-modules-core's PermissionsInterface).
export default function LocationScreen() {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [permanentlyDenied, setPermanentlyDenied] = useState(false);
  const [requesting, setRequesting] = useState(false);

  async function handleAllowLocation() {
    setStatusMessage(null);
    setPermanentlyDenied(false);
    setRequesting(true);
    try {
      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (canAskAgain) {
          setStatusMessage("Location access wasn't granted. You can try again or skip for now.");
        } else {
          setPermanentlyDenied(true);
          setStatusMessage('Location access is turned off for Grrunch. Turn it on in Settings, or skip for now.');
        }
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      router.push({
        pathname: '/stores',
        params: {
          lat: String(position.coords.latitude),
          lng: String(position.coords.longitude),
        },
      });
    } catch {
      setStatusMessage("Couldn't get your location. You can try again or skip for now.");
    } finally {
      setRequesting(false);
    }
  }

  return (
    <LinearGradient colors={['#fff', '#FFEAD4']} style={styles.gradient}>
      <View style={styles.container}>
        <View style={styles.spacer} />
        <View style={styles.iconCircle}>
          <MapPinIcon size={48} color={INK} strokeWidth={1} />
        </View>
        <Text style={styles.title}>Find deals near you</Text>
        <Text style={styles.body}>
          Grrunch can use your location to show nearby stores. This is optional — you can skip for now and
          turn it on anytime, right from here.
        </Text>

        {statusMessage && (
          <View style={styles.statusBanner}>
            <XMarkIcon size={16} color="#888" />
            <Text style={styles.statusBannerText}>{statusMessage}</Text>
          </View>
        )}

        <View style={styles.spacer} />
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          onPress={handleAllowLocation}
          disabled={requesting}
        >
          <Text style={styles.primaryButtonText}>
            {requesting ? 'Locating…' : 'Allow location access'}
          </Text>
        </Pressable>
        {/* Only shown once truly denied -- re-requesting permission won't
            show the system dialog again at that point, so this is the
            one real path back to "on" (Anabelle, 2026-08-28: guests
            should be able to actually enable/re-enable location, not hit
            a dead end). Replaces the old "Choose store manually" button,
            which did nothing different from Skip and promised a search
            feature that was never built. */}
        {permanentlyDenied && (
          <Pressable style={styles.secondaryButton} onPress={() => Linking.openSettings()}>
            <Text style={styles.secondaryButtonText}>Open Settings</Text>
          </Pressable>
        )}
        <Pressable style={styles.skipButton} onPress={() => router.push('/stores')}>
          <Text style={styles.skipText}>Skip for now</Text>
          <ArrowRightIcon size={16} color={INK} strokeWidth={2} />
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  spacer: { height: 24 },
  iconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', marginBottom: 12, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', color: '#343837' },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F2F2F2',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 16,
    width: '100%',
  },
  statusBannerText: { fontSize: 14, color: '#555', flex: 1 },
  primaryButton: {
    width: '100%',
    height: 56,
    justifyContent: 'center',
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 28,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonPressed: { borderColor: INK },
  primaryButtonText: { color: INK, fontSize: 17, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  secondaryButton: {
    width: '100%',
    height: 56,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 28,
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryButtonText: { fontSize: 16, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold', color: INK },
  skipButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  skipText: { fontSize: 16, color: INK, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold' },
});
