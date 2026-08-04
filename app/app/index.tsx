import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

// Guest-mode wireframe step 1 — Terms & consent.
export default function TermsScreen() {
  function decline() {
    Alert.alert('Terms required', 'You need to agree to the terms to use Grrunch.');
  }

  return (
    <View style={styles.container}>
      <View style={styles.spacer} />
      <View style={styles.logo}>
        <Text style={styles.logoText}>G</Text>
      </View>
      <Text style={styles.title}>Grrunch</Text>
      <Text style={styles.body}>
        By continuing you agree to our <Text style={styles.link}>terms of use</Text> and{' '}
        <Text style={styles.link}>privacy policy</Text>. We collect basic usage data to show you
        deals and help build your grocery lists.
      </Text>
      <View style={styles.spacer} />
      <Pressable style={styles.primaryButton} onPress={() => router.push('/login')}>
        <Text style={styles.primaryButtonText}>I agree</Text>
      </Pressable>
      <Pressable onPress={decline}>
        <Text style={styles.declineText}>Decline</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  spacer: { height: 24 },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoText: { color: '#fff', fontSize: 32, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  title: { fontSize: 28, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', marginBottom: 16 },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', color: '#333' },
  link: { fontWeight: '700', fontFamily: 'OpenSans_700Bold', textDecorationLine: 'underline' },
  primaryButton: {
    width: '100%',
    backgroundColor: '#111',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  declineText: { color: '#888', fontSize: 15 },
});
