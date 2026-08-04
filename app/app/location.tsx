import * as Location from 'expo-location';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowRightIcon, MapPinIcon, XMarkIcon } from 'react-native-heroicons/outline';

// GRRUNCH DS -- matches login.tsx/index.tsx's palette.
const ACCENT = '#FFA955';
const INK = '#111';

// Guest-mode wireframe step 3 — Location permission.
// "Allow location access" requests real device location and forwards the
// coords to Stores. "Choose store manually" and "Skip for now" both push to
// Stores with no coords — there's no manual search UI yet (see
// nearest-stores/index.ts's documented gap), so Stores shows its own
// no-location state rather than pretending to have a result.
export default function LocationScreen() {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  async function handleAllowLocation() {
    setStatusMessage(null);
    setRequesting(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setStatusMessage('Location permission denied. You can search manually or skip for now.');
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
      setStatusMessage("Couldn't get your location. You can search manually or skip for now.");
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
          Grrunch can use your location to show nearby stores. This is optional — you can always
          search manually instead.
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
        <Pressable style={styles.secondaryButton} onPress={() => router.push('/stores')}>
          <Text style={styles.secondaryButtonText}>Choose store manually</Text>
        </Pressable>
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
