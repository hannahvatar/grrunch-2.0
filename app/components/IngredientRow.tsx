import { useEffect, useState } from 'react';
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
  // Deal image size in px (square) -- the Grocery list's compact
  // default, 36. Mutually exclusive with imageMaxSize below (recipe
  // page uses that instead); a caller should only ever pass one.
  imageSize?: number;
  // Fit-to-box mode: the image is scaled to its own real aspect ratio,
  // capped at imageMaxSize in WHICHEVER dimension is larger, instead of
  // forced into a square. The recipe page (see app/recipe.tsx) uses
  // this at 160 -- a fixed square badly cropped flyer cutouts, which
  // are never square themselves (real ratios across our own recipes'
  // deals range 0.47, Green Onions -- tall and narrow -- to 3.36, Swiss
  // Chalet ribs -- wide and flat). A strict fixed-width version was
  // tried first and rejected: it fixed wide images but forced every
  // tall/narrow one (Green Onions) to a wasteful 160x344 box. Capping
  // by whichever dimension is larger keeps every image's box at exactly
  // its own natural shape, never exceeding imageMaxSize in either
  // direction.
  imageMaxSize?: number;
}

// Fetches an image's real aspect ratio so imageMaxSize mode can size
// its box to match instead of guessing -- react-native's <Image>,
// unlike a web <img>, never auto-sizes to its source's intrinsic
// dimensions. Falls back to a square (1) if the URL fails to resolve,
// and only probes at all when a caller actually asked for imageMaxSize
// mode (the Grocery list's square imageSize mode never triggers a
// fetch).
function useImageAspectRatio(uri: string | undefined): number {
  const [ratio, setRatio] = useState(1);
  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    Image.getSize(
      uri,
      (width, height) => {
        if (!cancelled && height > 0) setRatio(width / height);
      },
      () => {} // keep the square fallback -- no source dimensions to size against
    );
    return () => {
      cancelled = true;
    };
  }, [uri]);
  return ratio;
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
  imageMaxSize,
}: IngredientRowProps) {
  // Only probes the image's real dimensions in imageMaxSize mode --
  // square imageSize mode (the Grocery list) never needs them.
  const aspectRatio = useImageAspectRatio(imageMaxSize ? dealTag?.imageUrl : undefined);
  // Fit the image within an imageMaxSize x imageMaxSize box, preserving
  // its real aspect ratio -- whichever dimension is larger gets capped
  // at imageMaxSize, the other shrinks proportionally. A wide image
  // (ratio > 1) is capped by width; a tall one (ratio < 1) by height;
  // never both, so the box always matches the image's own shape instead
  // of a fixed square or a fixed width.
  const fitWidth = imageMaxSize ? Math.min(imageMaxSize, imageMaxSize * aspectRatio) : undefined;
  const fitHeight = imageMaxSize ? Math.min(imageMaxSize, imageMaxSize / aspectRatio) : undefined;
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
      {dealTag?.imageUrl &&
        (imageMaxSize ? (
          <Image
            source={{ uri: dealTag.imageUrl }}
            // Box is sized to the image's own real aspect ratio (fetched
            // above), not forced square or a fixed width -- 'cover' vs
            // 'contain' is moot once width/height already match the
            // source's shape, so nothing gets cropped or letterboxed.
            style={[
              styles.itemImage,
              { width: fitWidth, height: fitHeight, borderRadius: Math.round(imageMaxSize / 10) },
            ]}
          />
        ) : (
          <Image
            source={{ uri: dealTag.imageUrl }}
            // Flyer cutouts are never square (real source dimensions
            // range from ~186x400 to 400x119 across our own recipes'
            // deals) -- 'contain' shows each image in full, letterboxed
            // on itemImage's placeholder background, instead of
            // cropping off whatever doesn't fit the square.
            resizeMode="contain"
            style={[
              styles.itemImage,
              { width: imageSize, height: imageSize, borderRadius: imageSize / 4.5 },
            ]}
          />
        ))}
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
