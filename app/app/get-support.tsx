import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronDownIcon, ChevronUpIcon, EnvelopeIcon, XMarkIcon } from 'react-native-heroicons/outline';

import { FAQ_ITEMS, SUPPORT_EMAIL } from '../lib/support';

const ACCENT = '#FFA955';
const INK = '#111';

// Its own real screen -- reached from both Settings > Get support and the
// floating chat bubble (SupportBubble.tsx). No live chat (needs a real
// 3rd-party provider Anabelle hasn't set up), so "Contact us" composes a
// real email via the device's mail client instead of a chat widget that
// wouldn't actually connect to anyone.
export default function GetSupportScreen() {
  const [openFaq, setOpenFaq] = useState<Set<number>>(new Set());

  function toggleFaq(index: number) {
    setOpenFaq((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  async function handleContactUs() {
    if (!SUPPORT_EMAIL) {
      Alert.alert('Not set up yet', "Email support isn't available yet — check back soon.");
      return;
    }
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Grrunch support')}`;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      Linking.openURL(url);
    } else {
      Alert.alert('No email app found', `Reach us directly at ${SUPPORT_EMAIL}.`);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Get support</Text>
        <Pressable style={styles.closeButton} onPress={() => router.back()} hitSlop={8}>
          <XMarkIcon size={18} color={INK} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          style={[styles.contactButton, !SUPPORT_EMAIL && styles.contactButtonDisabled]}
          onPress={handleContactUs}
        >
          <EnvelopeIcon size={18} color={INK} />
          <Text style={styles.contactButtonText}>
            {SUPPORT_EMAIL ? 'Email support' : 'Email support (not set up yet)'}
          </Text>
        </Pressable>

        <Text style={styles.faqHeading}>FAQ</Text>
        <View style={styles.faqContainer}>
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = openFaq.has(i);
            const isLast = i === FAQ_ITEMS.length - 1;
            return (
              <View key={item.question} style={[styles.faqRow, isLast && styles.faqRowLast]}>
                <Pressable style={styles.faqHeader} onPress={() => toggleFaq(i)} hitSlop={8}>
                  <Text style={styles.faqQuestion}>{item.question}</Text>
                  {isOpen ? (
                    <ChevronUpIcon size={16} color={INK} />
                  ) : (
                    <ChevronDownIcon size={16} color={INK} />
                  )}
                </Pressable>
                {isOpen && <Text style={styles.faqAnswer}>{item.answer}</Text>}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // GRRUNCH DS peach background, matches settings.tsx/how-it-works.tsx.
  container: { flex: 1, backgroundColor: '#FFEAD4' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 60,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  content: { paddingHorizontal: 24, paddingBottom: 40 },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
    height: 52,
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 26,
    marginBottom: 28,
  },
  contactButtonDisabled: { opacity: 0.6 },
  contactButtonText: { fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  faqHeading: { fontSize: 20, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK, marginBottom: 12 },
  // White card, matches how-it-works.tsx's table container -- same
  // GRRUNCH DS "content lives in a white card on the peach page" pattern.
  faqContainer: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: INK,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  faqRow: {
    borderBottomWidth: 1,
    borderBottomColor: INK,
    paddingVertical: 16,
  },
  faqRowLast: { borderBottomWidth: 0 },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  faqQuestion: { flex: 1, fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  faqAnswer: { fontSize: 13, color: INK, marginTop: 10, lineHeight: 19 },
});
