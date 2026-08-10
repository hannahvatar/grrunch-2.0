import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckIcon } from 'react-native-heroicons/outline';

import { MIN_DISPLAYED_DISCOUNT_PCT } from '../lib/curatedDeals';
import type { DealTag } from '../lib/mealData';

interface IngredientRowProps {
  text: string;
  dealTag?: DealTag;
  estimatedPrice?: { avgPrice: number; unit: string; source: 'statcan' | 'produce' | 'staple' };
  // Grocery-only extras -- the recipe page passes none of these, so it
  // renders the same image/name/price/badge display without a checkbox,
  // source line, or batch multiplier.
  meta?: string;
  checked?: boolean;
  onToggleCheck?: () => void;
  multiplier?: number;
  // Deal image size in px (square) -- defaults to the Grocery list's
  // compact 36, but the recipe page's own deal cards (see app/recipe.tsx)
  // want a larger 90 now that each deal-tagged ingredient has its own
  // white card to fill. Border radius scales with it so a bigger image
  // doesn't look disproportionately sharp-cornered.
  imageSize?: number;
}

// One ingredient's display -- shared verbatim by the Grocery list and the
// recipe page, so an ingredient looks and prices the same wherever it
// shows up. The only differences between the two screens are which extra
// props they pass (Grocery: checked/onToggleCheck/meta/multiplier; recipe:
// none of those), never the core layout.
export function IngredientRow({
  text,
  dealTag,
  estimatedPrice,
  meta,
  checked,
  onToggleCheck,
  multiplier,
  imageSize = 36,
}: IngredientRowProps) {
  return (
    <View style={styles.itemRow}>
      {onToggleCheck && (
        <Pressable
          style={[styles.checkbox, checked && styles.checkboxChecked]}
          onPress={onToggleCheck}
          hitSlop={8}
        >
          {checked && <CheckIcon size={12} color="#fff" />}
        </Pressable>
      )}
      {dealTag?.imageUrl && (
        <Image
          source={{ uri: dealTag.imageUrl }}
          style={[
            styles.itemImage,
            { width: imageSize, height: imageSize, borderRadius: imageSize / 4.5 },
          ]}
        />
      )}
      <View style={styles.itemInfo}>
        <Text style={[styles.itemName, checked && styles.itemNameChecked]}>{text}</Text>
        {meta && <Text style={styles.itemMeta}>{meta}</Text>}
        {dealTag?.quantityEstimated && (
          <Text style={styles.estimatedDisclaimer}>*Quantity is estimated. See store</Text>
        )}
      </View>
      <View style={styles.itemRightColumn}>
        {!!multiplier && multiplier > 1 && (
          <View style={styles.multiplierBadge}>
            <Text style={styles.multiplierBadgeText}>×{multiplier}</Text>
          </View>
        )}
        {dealTag?.price != null && (
          <View style={styles.itemPriceRow}>
            <Text style={styles.itemPriceValue}>${dealTag.price.toFixed(2)}</Text>
            {dealTag.originalPrice != null &&
              dealTag.originalPrice > dealTag.price &&
              dealTag.discountPct >= MIN_DISPLAYED_DISCOUNT_PCT && (
                <Text style={styles.itemPriceOriginal}>${dealTag.originalPrice.toFixed(2)}</Text>
              )}
          </View>
        )}
        {!dealTag && estimatedPrice && (
          <Text style={styles.itemPriceEstimated}>{`$${estimatedPrice.avgPrice.toFixed(2)} avg.`}</Text>
        )}
        {dealTag &&
          (dealTag.discountPct >= MIN_DISPLAYED_DISCOUNT_PCT ? (
            <View style={styles.discountBadge}>
              <Text style={styles.discountBadgeText}>Up to {dealTag.discountPct}% off</Text>
            </View>
          ) : (
            <View style={styles.fairPriceBadge}>
              <Text style={styles.fairPriceBadgeText}>Fair price</Text>
            </View>
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#111', borderColor: '#111' },
  // width/height/borderRadius are overridden inline per imageSize --
  // only the placeholder background lives here.
  itemImage: { backgroundColor: '#F2F2F2' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15 },
  itemNameChecked: { textDecorationLine: 'line-through', color: '#aaa' },
  itemMeta: { fontSize: 12, color: '#999', marginTop: 1 },
  estimatedDisclaimer: { fontSize: 11, color: '#B8860B', fontStyle: 'italic', marginTop: 2 },
  itemRightColumn: { alignItems: 'flex-end', gap: 6 },
  itemPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  itemPriceValue: { fontSize: 14, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  itemPriceOriginal: { fontSize: 11, color: '#aaa', textDecorationLine: 'line-through' },
  itemPriceEstimated: { fontSize: 12, color: '#888' },
  discountBadge: { backgroundColor: '#2C5FD6', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  discountBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  fairPriceBadge: { backgroundColor: '#E8B800', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  fairPriceBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  multiplierBadge: { backgroundColor: '#F2F2F2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  multiplierBadgeText: { color: '#666', fontSize: 11, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
});
