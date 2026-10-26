import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const INK = '#111';
// Anabelle's starburst "blurb" (blurb.svg, 2026-10-26), drawn on a
// 265x265 box.
const BURST_PATH =
  'M132.341 15.5562L149.765 0L162.568 19.5376L183.421 9.02607L190.738 31.2104L213.603 26.4599L214.929 49.7829L238.246 51.11L233.491 73.9881L255.669 81.31L245.164 102.175L264.682 114.986L249.143 132.42L264.682 149.854L245.164 162.673L255.669 183.538L233.491 190.86L238.246 213.73L214.929 215.065L213.603 238.388L190.738 233.637L183.421 255.822L162.568 245.31L149.765 264.848L132.341 249.291L114.918 264.848L102.114 245.31L81.2616 255.822L73.9441 233.637L51.0796 238.388L49.7532 215.065L26.4366 213.73L31.1919 190.86L9.02069 183.538L19.5185 162.673L0 149.854L15.5394 132.42L0 114.986L19.5185 102.175L9.02069 81.31L31.1919 73.9881L26.4366 51.11L49.7532 49.7829L51.0796 26.4599L73.9441 31.2104L81.2616 9.02607L102.114 19.5376L114.918 0L132.341 15.5562Z';

// A recipe's price per serving inside the orange starburst -- Home's
// recipe cards only (Anabelle, 2026-10-26: "for the hp only the price per
// serving should be displayed in this blurb").
export function PriceBurst({ price, size = 112 }: { price: number; size?: number }) {
  return (
    <View style={{ width: size, height: size }} accessibilityLabel={`$${price.toFixed(2)} per serving`}>
      <Svg width={size} height={size} viewBox="0 0 265 265" style={StyleSheet.absoluteFill}>
        <Path d={BURST_PATH} fill="#FF942A" />
      </Svg>
      <View style={styles.content}>
        <Text style={[styles.price, { fontSize: Math.round(size * 0.2) }]}>${price.toFixed(2)}</Text>
        <Text style={[styles.unit, { fontSize: Math.max(11, Math.round(size * 0.1)) }]}>/ serving</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  price: { fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  unit: { fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK, marginTop: -2 },
});
