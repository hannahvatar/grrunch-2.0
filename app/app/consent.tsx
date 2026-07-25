import { router } from 'expo-router';
import { Button, ScrollView, StyleSheet, Text } from 'react-native';

// Step 0 — Consent — architecture.md section 2.2.
// Lightweight, no account required: logged at the device/session level
// (`sessions.agreed_to_terms_at`). When an account is later created, this
// session-level consent gets linked to the new account record so there's a
// continuous consent trail rather than a gap.

export default function ConsentScreen() {
  function agree() {
    // TODO: persist agreed_to_terms_at + terms_version to the local session
    // record (and Supabase `sessions` table) before dismissing.
    router.back();
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Before you start</Text>
      <Text style={styles.body}>
        Grrunch is a budget tool, not a substitute for professional nutrition
        guidance. Deal pricing comes from human-reviewed flyers, not live
        scraping — always confirm the final price on the retailer's page.
      </Text>
      <Button title="I agree" onPress={agree} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  title: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22, color: '#333' },
});
