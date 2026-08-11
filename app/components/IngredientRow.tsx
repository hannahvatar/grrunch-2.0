import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckIcon } from 'react-native-heroicons/outline';

import { MIN_DISPLAYED_DISCOUNT_PCT, toTitleCase } from '../lib/curatedDeals';
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
  // At the recipe page's 120px imageSize, a side-by-side row (image |
  // name+store+link | price) squeezed the price column in too, leaving
  // too little width for the rest on a phone screen. Keeps image +
  // description (name/store/link/meta) on the top row, same pairing as
  // the default row, and wraps just the price/badge onto its own row
  // underneath -- recipe-page deal items only (grocery's 36px
  // thumbnail has plenty of room beside the text as-is).
  stackedLayout?: boolean;
  // Leading bullet dot instead of an image -- for lists with no
  // per-item image at all (the recipe page's staple/pantry list),
  // where a bare name+price row otherwise reads as an unmarked list.
  bulleted?: boolean;
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
  stackedLayout,
  bulleted,
}: IngredientRowProps) {
  // stackedLayout only -- text is always "<quantity> <rest of
  // description>" for a deal item (e.g. "1 package Prime raised...",
  // see lib/recipes.ts describeDealPackage/describeQuantityText, which
  // always lead with the quantity token). Split the leading token out
  // to show standalone in an ellipse badge on the price row below,
  // rather than repeating it at the front of the name -- the remaining
  // description is title-cased (same toTitleCase treatment MealCard.tsx
  // already applies to flyer-sourced deal names, which come through
  // however the store printed them, often ALL CAPS or, like here,
  // lowercase mid-sentence -- "package Prime raised..." ->
  // "Package Prime Raised...").
  const [dealQuantityBase, ...dealDescriptionWords] = text.split(' ');
  const dealDescriptionRest = dealDescriptionWords.join(' ');
  const dealDescription = dealDescriptionRest ? toTitleCase(dealDescriptionRest) : text;
  // The badge below folds the servings stepper's batch multiplier
  // directly into this number (rather than showing it as a separate
  // "×2" badge alongside a static "1") -- text itself never reflects
  // the multiplier for deal-tagged lines (never fragmented, always
  // "1 package ..." regardless of batch size -- see
  // lib/mealScaling.ts scaleIngredientDisplay), so without this the
  // ellipse would keep reading "1" even after doubling the batch,
  // sitting right next to a separate badge that DID update -- two
  // numbers telling two different stories in the same row.
  const dealQuantityBaseNum = parseFloat(dealQuantityBase);
  const dealQuantity =
    !!multiplier && multiplier > 1 && !Number.isNaN(dealQuantityBaseNum)
      ? String(Math.round(dealQuantityBaseNum * multiplier * 100) / 100)
      : dealQuantityBase;
  const imageEl = dealTag?.imageUrl && (
    <View
      style={[styles.itemImageBox, { width: imageSize, height: imageSize, borderRadius: imageSize / 4.5 }]}
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
  );

  const infoEl = (
    <View style={styles.itemInfo}>
      <Text style={[styles.itemName, !!dealTag && styles.itemNameDeal, checked && styles.itemNameChecked]}>
        {text}
      </Text>
      {showStoreLink && dealTag?.store && <Text style={styles.itemStore}>{dealTag.store}</Text>}
      {showStoreLink && dealTag && (
        <Pressable
          style={styles.flyerLinkRow}
          onPress={dealTag.productUrl ? () => openInNewTab(dealTag.productUrl!) : undefined}
          disabled={!dealTag.productUrl}
          hitSlop={4}
        >
          <Text style={[styles.flyerLink, !dealTag.productUrl && styles.flyerLinkDisabled]}>See in flyer</Text>
          <ArrowOutwardIcon size={12} color={dealTag.productUrl ? INK : '#999'} />
        </Pressable>
      )}
      {meta && <Text style={styles.itemMeta}>{meta}</Text>}
      {dealTag?.quantityEstimated && (
        <Text style={styles.estimatedDisclaimer}>*Quantity is estimated. See store</Text>
      )}
    </View>
  );

  // stackedLayout only -- same as infoEl, but the name shows
  // dealDescription (leading quantity token stripped, since that now
  // shows on its own in the price row's ellipse badge) instead of the
  // raw text.
  const dealInfoEl = (
    <View style={styles.itemInfo}>
      <Text style={[styles.itemName, !!dealTag && styles.itemNameDeal, checked && styles.itemNameChecked]}>
        {dealDescription}
      </Text>
      {showStoreLink && dealTag?.store && <Text style={styles.itemStore}>{dealTag.store}</Text>}
      {showStoreLink && dealTag && (
        <Pressable
          style={styles.flyerLinkRow}
          onPress={dealTag.productUrl ? () => openInNewTab(dealTag.productUrl!) : undefined}
          disabled={!dealTag.productUrl}
          hitSlop={4}
        >
          <Text style={[styles.flyerLink, !dealTag.productUrl && styles.flyerLinkDisabled]}>See in flyer</Text>
          <ArrowOutwardIcon size={12} color={dealTag.productUrl ? INK : '#999'} />
        </Pressable>
      )}
      {meta && <Text style={styles.itemMeta}>{meta}</Text>}
      {dealTag?.quantityEstimated && (
        <Text style={styles.estimatedDisclaimer}>*Quantity is estimated. See store</Text>
      )}
    </View>
  );

  const priceEl = (
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
  );

  // stackedLayout only -- the leading quantity token (dealQuantity,
  // already multiplier-folded above) in an ellipse badge, now up in
  // the top row (see stackedTopRow below) rather than its own row --
  // no separate ×N multiplier badge here (unlike priceEl's own
  // multiplierBadge below, for the default row). Just price + original
  // price + discount/fair-price pill grouped tightly together (price
  // sits right before its own tag, not spread out from it), right-
  // aligned as the row's only content. Pill shape/colors match the
  // design reference for this card; wording (still "Up to X% off", not
  // just "X% off") stays as-is since that's the real discount-estimate
  // disclaimer, not just decorative copy.
  const dealPriceRowEl = (
    <View style={styles.dealPriceRow}>
      <View style={styles.dealPriceTagGroup}>
        <View style={styles.dealPriceLeft}>
          {dealTag?.price != null && <Text style={styles.itemPriceValue}>${dealTag.price.toFixed(2)}</Text>}
          {dealTag?.originalPrice != null &&
            dealTag.originalPrice > dealTag.price! &&
            dealTag.discountPct >= MIN_DISPLAYED_DISCOUNT_PCT && (
              <Text style={styles.itemPriceOriginal}>${dealTag.originalPrice.toFixed(2)}</Text>
            )}
        </View>
        {dealTag &&
          (dealTag.discountPct >= MIN_DISPLAYED_DISCOUNT_PCT ? (
            <View style={styles.dealDiscountBadge}>
              <Text style={styles.dealDiscountBadgeText}>Up to {dealTag.discountPct}% off</Text>
            </View>
          ) : (
            <View style={styles.dealFairPriceBadge}>
              <Text style={styles.dealFairPriceBadgeText}>Fair price</Text>
            </View>
          ))}
      </View>
    </View>
  );

  // Stacked: image + dealInfoEl (name minus its leading quantity token,
  // store, link, meta) + the quantity ellipse badge all share the top
  // row now -- badge last, so it lands top-right (stackedTopRow's
  // alignItems: flex-start keeps it top-aligned, and it's the row's
  // last fixed-width child after the flex: 1 description soaks up the
  // space between image and badge). Then the price row wraps
  // underneath. Plain (no border/card of its own) -- these already sit
  // inside the recipe page's single "On Sale This Week" bordered card
  // (ingredientsModalCard), and a border per item on top of that read
  // as nested cards. No checkbox in this mode -- only the recipe
  // page's deal items use stackedLayout, and the recipe page never
  // passes onToggleCheck.
  if (stackedLayout) {
    return (
      <View style={styles.dealItemRow}>
        <View style={styles.stackedTopRow}>
          {imageEl}
          {dealInfoEl}
          <View style={styles.dealQuantityBadge}>
            <Text style={styles.dealQuantityBadgeText}>{dealQuantity}</Text>
          </View>
        </View>
        {dealPriceRowEl}
      </View>
    );
  }

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
      {bulleted && <Text style={styles.bulletMarker}>•</Text>}
      {imageEl}
      {infoEl}
      {priceEl}
    </View>
  );
}

const styles = StyleSheet.create({
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // stackedLayout only -- plain, no border of its own (see the
  // no-nested-cards comment above); just the vertical gap between its
  // two rows (top row, price row).
  dealItemRow: { gap: 10 },
  // Row 1: image + description + quantity badge -- badge is the row's
  // last child, after the flex: 1 description, so it lands at the
  // row's right edge; alignItems: flex-start keeps it top-aligned
  // rather than centered against the taller image/description.
  stackedTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  // Row 2: just the price+tag group now (quantity badge moved up to
  // stackedTopRow) -- right-aligned as the row's only content.
  dealPriceRow: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', rowGap: 6 },
  // Circular/pill outline badge for the bare quantity number -- same
  // white-fill/black-border language as the app's other circular
  // badges (closeButton, stepperButton).
  dealQuantityBadge: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealQuantityBadgeText: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  // Price (+ original, + multiplier) directly beside its own discount/
  // fair-price pill -- one tight group, not spread apart.
  dealPriceTagGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dealPriceLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
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
  bulletMarker: { fontSize: 15, color: INK },
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
  // Deal items (dealTag present) read at 16px -- both the name here and
  // itemPriceValue below, which only ever renders for a deal-tagged row
  // already (see the dealTag?.price != null check), so it didn't need
  // its own conditional variant the way the shared itemName Text does.
  itemNameDeal: { fontSize: 16 },
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
  // No real flyer link for this deal (dealTag.productUrl empty --
  // see recipe.tsx/IngredientRow.tsx comments on produce-gap-sourced
  // deals) -- still shown, not hidden, but muted/no-underline to read
  // as disabled rather than a dead link.
  flyerLinkDisabled: { color: '#999', textDecorationLine: 'none' },
  itemMeta: { fontSize: 12, color: '#999', marginTop: 1 },
  estimatedDisclaimer: { fontSize: 11, color: '#B8860B', fontStyle: 'italic', marginTop: 2 },
  itemRightColumn: { alignItems: 'flex-end', gap: 6 },
  itemPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  itemPriceValue: { fontSize: 16, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  itemPriceOriginal: { fontSize: 11, color: INK, textDecorationLine: 'line-through' },
  itemPriceEstimated: { fontSize: 12, color: '#767676' },
  discountBadge: { backgroundColor: '#2C5FD6', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  discountBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  fairPriceBadge: { backgroundColor: '#E8B800', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  fairPriceBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  // stackedLayout only -- pill-shaped variants (borderRadius: 999) of
  // the badges above, matching the design reference's rounded-capsule
  // shape instead of discountBadge/fairPriceBadge's rounded-rect.
  dealDiscountBadge: { backgroundColor: '#DFF5E3', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  dealDiscountBadgeText: {
    color: '#1B7A43',
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'OpenSans_800ExtraBold',
  },
  dealFairPriceBadge: { backgroundColor: '#E8B800', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  dealFairPriceBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'OpenSans_800ExtraBold',
  },
  multiplierBadge: { backgroundColor: '#F2F2F2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  multiplierBadgeText: { color: '#666', fontSize: 11, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
});
