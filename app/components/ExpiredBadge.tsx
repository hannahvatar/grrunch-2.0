import { StyleSheet, Text, View } from 'react-native';

// Shown instead of a deal's "Up to N% off" / "N% below" / "Fair price"
// badge once the live week's flyers have ended but the next week isn't
// published yet (lib/liveWeek.ts). Neutral grey -- the same palette as
// AlertBanner's 'neutral' variant -- so it reads as "no longer valid", not
// as a price judgement in any of the deal colors.
export function ExpiredBadge() {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>Expired</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', backgroundColor: '#F2F2F2', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  text: { color: '#3C3C3C', fontSize: 12, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
});
