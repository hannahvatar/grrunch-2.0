import { StyleSheet, Text, View } from 'react-native';

const INK = '#111';

// The food bank mission, under the membership card in Profile (Anabelle,
// 2026-10-30, her wording). Same title as the last onboarding slide; the
// 1% and the membership are named here, not in onboarding, where she felt
// talking about a membership that early could put people off. Warm brand
// orange, no icon (Anabelle removed the heart, 2026-10-30), not one of
// AlertBanner's status colours, so it reads as a mission rather than a
// system notice.
// "member" thanks people who've joined (under their membership card);
// "join" sits inside the free-trial card for non-members, without the
// thank-you (Anabelle, 2026-10-30).
const BODY = {
  member: "Thank you so much! Your membership will help feed more than just you. We'll donate 1% of our profits to food banks. 🧡",
  join: "Your membership will help feed more than just you. We'll donate 1% of our profits to food banks. 🧡",
};

export function FoodBankMission({
  variant = 'member',
  centered = false,
}: {
  variant?: keyof typeof BODY;
  // Centred text in a panel capped to the button's width, for the centred
  // upgrade tile on Home.
  centered?: boolean;
}) {
  return (
    <View style={[styles.banner, centered && styles.bannerCentered]}>
      <View style={styles.text}>
        <Text style={[styles.title, centered && styles.textCentered]}>Let's Bite Back at Hunger, Together</Text>
        <Text style={[styles.body, centered && styles.textCentered]}>{BODY[variant]}</Text>
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
  bannerCentered: { alignSelf: 'stretch', width: '100%', maxWidth: 320, marginHorizontal: 'auto' },
  textCentered: { textAlign: 'center' },
  text: { gap: 4 },
  title: { fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  body: { fontSize: 16, lineHeight: 22, color: INK },
});
