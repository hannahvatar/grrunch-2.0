import type { ReactNode } from 'react';
import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { PencilIcon, TrashIcon } from 'react-native-heroicons/outline';
// @deprecated (upstream) in favor of the Reanimated-based rewrite --
// still fully functional in gesture-handler 2.28 (no reanimated
// dependency needed, confirmed), just flagged for a future migration
// once react-native-reanimated is already in this project for some
// other reason. Not worth adding a second new native dependency (plus
// its own babel plugin/config changes, a much bigger blast radius)
// just to pre-empt a deprecation warning.
//
// GesturePressable (aliased) is gesture-handler's OWN Pressable, not
// react-native's -- needed specifically for the Remove button nested
// inside Swipeable below. Confirmed live: a plain react-native
// Pressable there never fires onPress on web (the tap gets consumed
// by gesture-handler's own pointer-capture on the Swipeable ancestor
// before it reaches an ordinary RN Pressable's touch responder) --
// gesture-handler's own Pressable is built to integrate with that
// responder system correctly. Every other Pressable in this file
// stays the plain react-native one; only content living inside
// Swipeable needs this.
import { Swipeable, Pressable as GesturePressable } from 'react-native-gesture-handler';

import {
  formatComparePriceLabel,
  formatDealBadgePrice,
  formatGreatReferenceValueLabel,
  isGreatReferenceValue,
  isReferencePriced,
  showsRealDiscount,
} from '../lib/curatedDeals';
import type { DealTag } from '../lib/mealData';
import { computeDealPackageCount } from '../lib/unitConversion';
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
  // The recipe's own real per-batch quantity/unit (e.g. "240"/"g" for
  // Tilda Basmati Rice) -- needed alongside `multiplier` to compute the
  // real package count correctly for a fragmented deal item (see
  // computeDealPackageCount). Optional: a caller that never fragments
  // any of its deal items (or doesn't have this data handy) can omit
  // both and still get the old always-N-packages behavior, since
  // computeDealPackageCount falls back to that when quantity/unit don't
  // parse.
  quantity?: string;
  unit?: string;
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
  // Grocery-only, like checked/onToggleCheck above -- the recipe page
  // never passes these, so it stays view-only.
  //
  // Swipe-left-to-remove (Anabelle's call, replacing an earlier
  // trailing X icon) -- wraps the whole row in Swipeable when present,
  // revealing a red Remove action; onRemove owns actually dropping the
  // item from whatever list state holds it (see GroceryListView.tsx's
  // removedKeys), this component only ever asks, never assumes.
  onRemove?: () => void;
  // Pencil icon next to the item's quantity, opening a shared bottom
  // sheet (GroceryListView.tsx owns the sheet itself, one instance for
  // the whole screen rather than one per row) with a stepper + numeric
  // keyboard input. This component only ever asks the parent to open
  // it for this specific item -- it doesn't know or care how the
  // resulting edit gets applied.
  onEditQuantity?: () => void;
  // Recipe-page-only -- when this ingredient's name matches a
  // sub-recipe's matchIngredientName (see recipe.tsx), the substring of
  // the (already-lowercased) display text equal to linkedText renders
  // as an underlined, pressable jump link to that sub-recipe's section
  // instead of plain text. Case-insensitive match against `text`;
  // rendered substring keeps the row's own lowercase styling. Ignored
  // for stackedLayout/deal rows -- only ever passed alongside bulleted
  // staple rows in practice (see recipe.tsx).
  linkedText?: string;
  onLinkedTextPress?: () => void;
  // "Use 217 g" -- only set for a dealTag.fragmentByWeight ingredient
  // (see lib/recipes.ts mapIngredient), since only those have a price
  // that actually reflects less than the whole package. Rendered as a
  // small annotation under the store/flyer-link line, same tone as
  // estimatedDisclaimer below. Anabelle: "users now dont know what
  // quantity to use" once the badge stopped showing a fragmented price.
  useQuantityText?: string;
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
  onRemove,
  onEditQuantity,
  linkedText,
  onLinkedTextPress,
  useQuantityText,
  quantity,
  unit,
}: IngredientRowProps) {
  // stackedLayout only -- text is always "<quantity> <rest of
  // description>" for a deal item (e.g. "1 package Prime raised...",
  // see lib/recipes.ts describeDealPackage/describeQuantityText, which
  // always lead with the quantity token). Split the leading token out
  // to show standalone in an ellipse badge on the price row below,
  // rather than repeating it at the front of the name.
  const [dealQuantityBase, ...dealDescriptionWords] = text.split(' ');
  const dealDescriptionRest = dealDescriptionWords.join(' ');
  // Ingredient list reads lowercase throughout (Anabelle's call) --
  // was title-cased here specifically (same toTitleCase treatment
  // MealCard.tsx still applies to flyer-sourced deal names elsewhere,
  // which come through however the store printed them, often ALL CAPS
  // or lowercase mid-sentence) but that's no longer the house style
  // for this list specifically.
  const dealDescription = (dealDescriptionRest || text).toLowerCase();
  // The badge below folds the servings stepper's batch multiplier
  // directly into this number (rather than showing it as a separate
  // "×2" badge alongside a static "1") -- text itself never reflects
  // the multiplier for deal-tagged lines (see lib/mealScaling.ts
  // scaleIngredientDisplay), so without this the ellipse would keep
  // reading "1" even after doubling the batch, sitting right next to a
  // separate badge that DID update -- two numbers telling two different
  // stories in the same row.
  //
  // computeDealPackageCount (not a blind dealQuantityBaseNum * multiplier
  // fold) -- a FRAGMENTED deal item (fragmentByWeight, e.g. Tilda
  // Basmati Rice) only genuinely needs a 2nd package once the scaled
  // real quantity exceeds one whole package's weight, not just because
  // the batch count doubled (real bug, fixed: doubling a 240 g/4.54 kg
  // rice recipe to 480 g total still only needs 1 bag -- see that
  // function's own comment for the full reasoning, including why a
  // NON-fragmented item like Hoisin Sauce keeps the old N-packages-per-
  // N-batches behavior).
  const dealQuantity =
    !!multiplier && multiplier > 1
      ? String(
          computeDealPackageCount(
            quantity,
            unit,
            dealTag?.packageWeightG,
            dealTag?.fragmentByWeight,
            multiplier,
            dealTag?.packageVolumeMl,
            dealTag?.bundleCount
          )
        )
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

  // Splits the lowercased name around linkedText (case-insensitive) and
  // renders the matched substring as its own pressable, underlined
  // nested Text -- standard RN inline-pressable-text pattern. Falls
  // back to a single plain Text when there's no linkedText, or it
  // isn't actually present in this row's name (e.g. every OTHER
  // ingredient on the page, which never receives linkedText's matching
  // sub-recipe at all -- see recipe.tsx).
  const lowerText = text.toLowerCase();
  const linkIndex = linkedText ? lowerText.indexOf(linkedText.toLowerCase()) : -1;
  const itemNameContent =
    linkIndex >= 0 && linkedText ? (
      <>
        {lowerText.slice(0, linkIndex)}
        <Text style={styles.itemNameLink} onPress={onLinkedTextPress}>
          {lowerText.slice(linkIndex, linkIndex + linkedText.length)}
        </Text>
        {lowerText.slice(linkIndex + linkedText.length)}
      </>
    ) : (
      lowerText
    );

  // Same idea as itemNameContent above, but for the stacked/deal-card
  // layout's own name source (dealDescription, the real flyer name --
  // not the recipe's own ingredient name `text` is built from). Real
  // gap, caught live: dealInfoEl (below) rendered dealDescription as a
  // single plain string regardless of linkedText, so a sub-recipe
  // linked from a DEAL-tagged ingredient (e.g. Potatoes -> "Crispy
  // Breakfast Potatoes") never became clickable in the "On Sale This
  // Week" card, even though the same recipe.tsx already passed
  // linkedText/onLinkedTextPress here same as it does for the plain
  // pantry list.
  const linkIndexDeal = linkedText ? dealDescription.indexOf(linkedText.toLowerCase()) : -1;
  const dealNameContent =
    linkIndexDeal >= 0 && linkedText ? (
      <>
        {dealDescription.slice(0, linkIndexDeal)}
        <Text style={styles.itemNameLink} onPress={onLinkedTextPress}>
          {dealDescription.slice(linkIndexDeal, linkIndexDeal + linkedText.length)}
        </Text>
        {dealDescription.slice(linkIndexDeal + linkedText.length)}
      </>
    ) : (
      dealDescription
    );

  const infoEl = (
    <View style={styles.itemInfo}>
      <Text style={[styles.itemName, !!dealTag && styles.itemNameDeal, checked && styles.itemNameChecked]}>
        {itemNameContent}
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
      {useQuantityText && <Text style={styles.useQuantityText}>{useQuantityText}</Text>}
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
        {dealNameContent}
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
      {useQuantityText && <Text style={styles.useQuantityText}>{useQuantityText}</Text>}
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
          <Text style={styles.itemPriceValue}>
            {dealTag.priceEstimated && <Text style={styles.itemPriceEstimated}>est. </Text>}$
            {formatDealBadgePrice(dealTag.rawPrice ?? dealTag.price, dealTag.priceUnit, dealTag.packageWeightG).toFixed(2)}
          </Text>
          {dealTag.originalPrice != null &&
            dealTag.originalPrice > dealTag.price &&
            showsRealDiscount(dealTag.discountPct, dealTag.originalPriceSource) && (
              <Text style={styles.itemPriceOriginal}>
                $
                {formatDealBadgePrice(
                  dealTag.rawOriginalPrice ?? dealTag.originalPrice,
                  dealTag.priceUnit,
                  dealTag.packageWeightG
                ).toFixed(2)}
              </Text>
            )}
        </View>
      )}
      {!dealTag && estimatedPrice && (
        <Text style={styles.itemPriceEstimated}>{`$${estimatedPrice.avgPrice.toFixed(2)} avg.`}</Text>
      )}
      {dealTag && isReferencePriced(dealTag.originalPriceSource) && dealTag.originalPrice != null && (
        <Text style={styles.itemPriceEstimated}>
          {formatComparePriceLabel(
            formatDealBadgePrice(dealTag.rawOriginalPrice ?? dealTag.originalPrice, dealTag.priceUnit, dealTag.packageWeightG)
          )}
        </Text>
      )}
      {dealTag &&
        (showsRealDiscount(dealTag.discountPct, dealTag.originalPriceSource) ? (
          <View style={styles.discountBadge}>
            <Text style={styles.discountBadgeText}>Up to {dealTag.discountPct}% off</Text>
          </View>
        ) : isGreatReferenceValue(dealTag.discountPct, dealTag.originalPriceSource) ? (
          <View style={styles.greatValueBadge}>
            <Text style={styles.discountBadgeText}>{formatGreatReferenceValueLabel(dealTag.discountPct)}</Text>
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
          {dealTag?.price != null && (
            <Text style={styles.itemPriceValue}>
              {dealTag.priceEstimated && <Text style={styles.itemPriceEstimated}>est. </Text>}$
              {formatDealBadgePrice(dealTag.rawPrice ?? dealTag.price, dealTag.priceUnit, dealTag.packageWeightG).toFixed(2)}
            </Text>
          )}
          {dealTag?.originalPrice != null &&
            dealTag.originalPrice > dealTag.price! &&
            showsRealDiscount(dealTag.discountPct, dealTag.originalPriceSource) && (
              <Text style={styles.itemPriceOriginal}>
                $
                {formatDealBadgePrice(
                  dealTag.rawOriginalPrice ?? dealTag.originalPrice,
                  dealTag.priceUnit,
                  dealTag.packageWeightG
                ).toFixed(2)}
              </Text>
            )}
          {dealTag && isReferencePriced(dealTag.originalPriceSource) && dealTag.originalPrice != null && (
            <Text style={styles.itemPriceEstimated}>
              {formatComparePriceLabel(
                formatDealBadgePrice(dealTag.rawOriginalPrice ?? dealTag.originalPrice, dealTag.priceUnit, dealTag.packageWeightG)
              )}
            </Text>
          )}
        </View>
        {dealTag &&
          (showsRealDiscount(dealTag.discountPct, dealTag.originalPriceSource) ? (
            <View style={styles.dealDiscountBadge}>
              <Text style={styles.dealDiscountBadgeText}>Up to {dealTag.discountPct}% off</Text>
            </View>
          ) : isGreatReferenceValue(dealTag.discountPct, dealTag.originalPriceSource) ? (
            <View style={styles.dealGreatValueBadge}>
              <Text style={styles.dealGreatValueBadgeText}>{formatGreatReferenceValueLabel(dealTag.discountPct)}</Text>
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
  // store, link, meta) + the quantity badge all share the top row now
  // -- badge last, so it lands top-right (stackedTopRow's
  // alignItems: flex-start keeps it top-aligned, and it's the row's
  // last fixed-width child after the flex: 1 description soaks up the
  // space between image and badge). Then the price row wraps
  // underneath. Plain (no border/card of its own) -- these already sit
  // inside a bordered card either way (the recipe page's single "On
  // Sale This Week" card, or the Grocery list's per-store card), and a
  // border per item on top of that would read as nested cards.
  //
  // No checkbox control (see the content-building block below for why)
  // -- the recipe page never passed onToggleCheck anyway (view-only),
  // and the Grocery list now toggles checked by tapping the item's own
  // info block instead.
  // Grocery-only -- shows next to the quantity in either layout,
  // opens GroceryListView's single shared bottom sheet for this item.
  // Styled as a tertiary icon button (light grey fill, rounded square)
  // -- Anabelle's call, was a bare icon with just padding before -- and
  // INK (was muted #999) to actually read as a real, tappable control
  // rather than decoration.
  const editButtonEl = onEditQuantity && (
    <Pressable style={styles.editButton} onPress={onEditQuantity} hitSlop={8}>
      <PencilIcon size={13} color={INK} />
    </Pressable>
  );

  // No checkbox control anymore (Anabelle's call) -- the tap-to-check
  // gesture moves to the info block itself instead, wrapped in a
  // Pressable when onToggleCheck is passed (recipe.tsx never passes
  // it, so its rows stay fully static/non-pressable, same as before).
  // The strikethrough (itemNameChecked) already reads off `checked`
  // regardless of what triggers it, so nothing about that changes.
  let content: ReactNode;
  if (stackedLayout) {
    content = (
      <View style={styles.dealItemRow}>
        <View style={styles.stackedTopRow}>
          {imageEl}
          {onToggleCheck ? (
            <Pressable style={styles.itemInfo} onPress={onToggleCheck}>
              {dealInfoEl}
            </Pressable>
          ) : (
            dealInfoEl
          )}
          <View style={styles.dealQuantityBadge}>
            <Text style={styles.dealQuantityBadgeText}>{dealQuantity}</Text>
          </View>
          {editButtonEl}
        </View>
        {dealPriceRowEl}
      </View>
    );
  } else {
    content = (
      <View style={styles.itemRow}>
        {bulleted && <Text style={styles.bulletMarker}>•</Text>}
        {imageEl}
        {onToggleCheck ? (
          <Pressable style={styles.itemInfo} onPress={onToggleCheck}>
            {infoEl}
          </Pressable>
        ) : (
          infoEl
        )}
        {editButtonEl}
        {priceEl}
      </View>
    );
  }

  // Grocery-only -- swipe-left-to-remove (Swipeable is a no-op wrapper
  // when onRemove isn't passed, so recipe.tsx's rows are never
  // swipeable at all). renderRightActions reveals a red "Remove" panel
  // as the row is dragged; tapping IT (not the drag itself) actually
  // calls onRemove -- a full swipe just reveals the action rather than
  // instant-deleting on overswipe, so an accidental far swipe can't
  // silently drop an item.
  if (!onRemove) {
    return content;
  }
  return (
    <Swipeable
      renderRightActions={() => (
        <GesturePressable style={styles.removeAction} onPress={onRemove}>
          <TrashIcon size={18} color="#fff" />
          <Text style={styles.removeActionText}>Remove</Text>
        </GesturePressable>
      )}
      overshootRight={false}
    >
      {content}
    </Swipeable>
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
  // Rounded-rectangle outline badge for the bare quantity number --
  // was a full circle/pill (borderRadius: 13 against a 26px box);
  // Anabelle's call to make it read as a rectangle instead. Border and
  // number both muted #767676 (was INK) -- reads as secondary data next
  // to the INK-stroke editButton beside it, which stays black since
  // that one's an actual actionable control, not a data display.
  dealQuantityBadge: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#767676',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealQuantityBadgeText: { fontSize: 13, fontWeight: '400', fontFamily: 'OpenSans_400Regular', color: '#767676' },
  // Grocery-only -- pencil, sits right next to the quantity in either
  // layout (stackedTopRow's badge, or the default row's trailing edge
  // before price). White fill, solid black stroke, fully rounded (an
  // ellipse/circle at this square size) -- matches the DS's own
  // "native-hollow-btn" component shape (Anabelle's final call, after a
  // brief detour through a rounded-square version).
  editButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Grocery-only -- the panel revealed by Swipeable's renderRightActions
  // on a left swipe. Solid red (a genuinely destructive action, unlike
  // every other muted/INK control on this screen), fills the full
  // height of whatever row it's attached to (flex: 1 -- Swipeable
  // renders this alongside the row's own height, not a fixed one).
  removeAction: {
    flex: 1,
    backgroundColor: '#DC2626',
    borderRadius: 12,
    marginLeft: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  removeActionText: { color: '#fff', fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  // Price (+ original, + multiplier) directly beside its own discount/
  // fair-price pill -- one tight group, not spread apart.
  dealPriceTagGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dealPriceLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
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
  // Recipe-page-only -- an ingredient name naming a sub-recipe (e.g.
  // "pork belly" -> Basic Crispy Pork Belly), rendered inline within
  // itemName as a jump link to that section at the bottom of the page.
  itemNameLink: { textDecorationLine: 'underline' },
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
  useQuantityText: { fontSize: 12, fontWeight: '400', fontFamily: 'OpenSans_400Regular', color: INK, marginTop: 2 },
  estimatedDisclaimer: { fontSize: 11, color: '#767676', fontStyle: 'italic', marginTop: 2 },
  itemRightColumn: { alignItems: 'flex-end', gap: 6 },
  itemPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  itemPriceValue: { fontSize: 16, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  itemPriceOriginal: { fontSize: 11, color: INK, textDecorationLine: 'line-through' },
  // Explicit fontFamily/fontWeight, not just the latter -- this custom
  // font doesn't get visually lighter from fontWeight alone (same
  // reason every fontWeight elsewhere pairs with a matching
  // fontFamily). Needed here specifically because "est." nests inside
  // itemPriceValue's OpenSans_800ExtraBold Text and would otherwise
  // inherit that boldness instead of reading as a muted aside.
  itemPriceEstimated: { fontSize: 12, color: '#767676', fontFamily: 'OpenSans_400Regular', fontWeight: '400' },
  discountBadge: { backgroundColor: '#2C5FD6', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  discountBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  // Peach/orange brand colors -- solid + white text, matching
  // discountBadge/greatValueBadge's own solid-bg convention.
  fairPriceBadge: { backgroundColor: '#FF7A2A', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  fairPriceBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  // Purple -- distinct from discountBadge's blue (real store markdown)
  // and fairPriceBadge's yellow (neutral), so a genuinely-good
  // reference-compared price never reads as either of those claims.
  // Reuses discountBadgeText (same white/bold/11px) -- only the
  // background differs.
  greatValueBadge: { backgroundColor: '#6B46C1', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
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
  // Light peach + saturated orange text -- matching
  // dealDiscountBadge/dealGreatValueBadge's own light-bg-dark-text
  // convention on this pill badge style.
  dealFairPriceBadge: { backgroundColor: '#FFEAD4', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  dealFairPriceBadgeText: {
    color: '#FF7A2A',
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'OpenSans_800ExtraBold',
  },
  dealGreatValueBadge: { backgroundColor: '#EDE7FE', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  dealGreatValueBadgeText: {
    color: '#6B46C1',
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'OpenSans_800ExtraBold',
  },
  multiplierBadge: { backgroundColor: '#F2F2F2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  multiplierBadgeText: { color: '#666', fontSize: 11, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
});
