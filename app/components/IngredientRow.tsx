import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckIcon } from 'react-native-heroicons/outline';

import { MIN_DISPLAYED_DISCOUNT_PCT } from '../lib/curatedDeals';
import type { DealTag } from '../lib/mealData';
import { ArrowOutwardIcon } from './MaterialSymbols';

const INK = '#111';

// Explicit window.open (same as a target="_blank" link) on web to
// guarantee an actual new tab rather than relying on Linking.openURL's
// web behavior. On native there's no tab concept -- Linking.openURL
// hands off to the system browser / an in-app browser view instead,
// the closest equivalent.
function openInNewTab(url: string) {
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    Linking.openURL(url);
  }
}

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
  // compact 36; the recipe page (see app/recipe.tsx) uses 120.
  //
  // A fit-to-box mode (sizing the box to each image's own aspect ratio
  // instead of a fixed square) was tried and reverted: it looked great
  // on wide/flat images but made every card a different, unpredictable
  // size depending on the image's shape -- standardizing back to a
  // fixed square reads far more consistent across a whole list.
  imageSize?: number;
  // Fills the square behind the sharp contain-mode image with a
  // blurred, zoomed copy of the SAME image (see the Image pair below)
  // -- flyer cutouts are never square themselves, so a plain contain
  // fit leaves visible letterboxing; blurring a copy of the image
  // itself always matches its real background color/pattern exactly,
  // without needing to sample/store a color from anywhere. Recipe-page
  // only; the Grocery list's compact 36px is too small for the effect
  // to matter.
  blurredBackdrop?: boolean;
  // Shows the deal's store name (dealTag.store) below the ingredient
  // name, plus a "See in flyer" link (dealTag.productUrl) that opens
  // that store's weekly flyer in a new tab -- recipe-page only. The
  // Grocery list already groups items under a store-name section
  // header, so repeating it per-row there would be redundant; the
  // recipe page has no other store attribution at all. The link itself
  // only renders when productUrl is a real, non-empty value (produce-
  // gap-sourced deals have none -- see DealTag.productUrl) -- never a
  // dead link.
  showStoreLink?: boolean;
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
  blurredBackdrop,
  showStoreLink,
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
        <View
          style={[
            styles.itemImageBox,
            { width: imageSize, height: imageSize, borderRadius: imageSize / 4.5 },
          ]}
        >
          {blurredBackdrop && (
            <Image
              source={{ uri: dealTag.imageUrl }}
              // Zoomed + blurred copy of the same image, filling the
              // whole box -- always matches its own real background
              // color/pattern exactly, whatever that is, since it's
              // literally the same source image rather than a guessed
              // or separately-sampled color.
              resizeMode="cover"
              blurRadius={Math.round(imageSize / 6)}
              style={StyleSheet.absoluteFillObject}
            />
          )}
          <Image
            source={{ uri: dealTag.imageUrl }}
            // Sharp copy on top, shown in full -- flyer cutouts are
            // never square (real source ratios across our own recipes'
            // deals range 0.47 to 3.36), so 'contain' avoids cropping
            // any of it off, unlike RN's own 'cover' default.
            //
            // Inset a fixed margin off every edge (blurredBackdrop
            // only) rather than filling the whole box: an image that
            // happens to already be ~square (e.g. Bulacan Sweet
            // Longanisa, 400x399) would otherwise fill it edge-to-edge
            // under 'contain' with zero gap left for the backdrop to
            // show through, even though the backdrop layer is still
            // there. The inset guarantees a visible blurred border on
            // every image regardless of its own aspect ratio.
            resizeMode="contain"
            style={blurredBackdrop ? styles.itemImageInset : StyleSheet.absoluteFillObject}
          />
        </View>
      )}
      <View style={styles.itemInfo}>
        <Text style={[styles.itemName, checked && styles.itemNameChecked]}>{text}</Text>
        {showStoreLink && dealTag?.store && <Text style={styles.itemStore}>{dealTag.store}</Text>}
        {showStoreLink && dealTag?.productUrl && (
          <Pressable style={styles.flyerLinkRow} onPress={() => openInNewTab(dealTag.productUrl!)} hitSlop={4}>
            <Text style={styles.flyerLink}>See in flyer</Text>
            <ArrowOutwardIcon size={12} color={INK} />
          </Pressable>
        )}
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
  // width/height/borderRadius are overridden inline per imageSize.
  // overflow: 'hidden' clips the absolutely-positioned backdrop/
  // foreground Image pair to the box's rounded corners; backgroundColor
  // is the fallback while an image is loading or blurredBackdrop is off.
  itemImageBox: { backgroundColor: '#F2F2F2', overflow: 'hidden', position: 'relative' },
  // A fixed 10% margin off every edge -- see the comment above where
  // this is used for why a same-size fill isn't always enough to
  // guarantee the blurred backdrop shows.
  itemImageInset: { position: 'absolute', top: '10%', left: '10%', right: '10%', bottom: '10%' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15 },
  itemNameChecked: { textDecorationLine: 'line-through', color: '#aaa' },
  itemStore: { fontSize: 12, color: '#767676', marginTop: 2 },
  flyerLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  flyerLink: {
    fontSize: 12,
    color: INK,
    fontWeight: '700',
    fontFamily: 'OpenSans_700Bold',
    textDecorationLine: 'underline',
  },
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
