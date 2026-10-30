import { StyleSheet, Text, View } from 'react-native';

const INK = '#111';

// The food bank mission, under the membership card in Profile (Anabelle,
// 2026-10-30, her wording). Same title as the last onboarding slide; the
// 1% and the membership are named here, not in onboarding, where she felt
// talking about a membership that early could put people off. Warm brand
// orange, no icon (Anabelle removed the heart, 2026-10-30), not one of
// AlertBanner's status colours, so it reads as a mission rather than a
// system notice.
export function FoodBankMission() {
  return (
    <View style={styles.banner}>
      <View style={styles.text}>
        <Text style={styles.title}>Let's Bite Back at Hunger, Together</Text>
        <Text style={styles.body}>
          Thank you so much! Your membership will help feed more than just you. We'll donate 1% of our profits to food
          banks. 🧡
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FFE3C7',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  text: { gap: 4 },
  title: { fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  body: { fontSize: 16, lineHeight: 22, color: INK },
});
