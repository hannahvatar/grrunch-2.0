import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LockClosedIcon,
  PlusIcon,
  TagIcon,
} from 'react-native-heroicons/outline';

import {
  type Deal,
  fetchAllDeals,
  formatComparePriceLabel,
  formatGreatReferenceValueLabel,
  groupDealsByCategory,
  isGreatReferenceValue,
  isReferencePriced,
  showsRealDiscount,
} from '../../lib/curatedDeals';
import { ArrowOutwardIcon } from '../../components/MaterialSymbols';
import { useSelectedDeals } from '../../lib/selectedDeals';
import { useSubscription } from '../../lib/subscription';

// GRRUNCH DS -- matches meals.tsx/recipe.tsx/GroceryListView.tsx's own
// peach background + white/2px-INK-border "modal treatment" card
// language, pulled over onto this screen (previously still on an
// earlier, plainer white-bg/thin-grey-border look that had drifted
// from the rest of the app).
const ACCENT = '#FFA955';
const INK = '#111';

// Free tier sees only the first 3 items in each category -- Grrunch Plus
// (30-day free trial, then $5.99/mo) unlocks the rest. A single "Unlock N
// more deals" tile stands in for however many are left, naming the real
// count rather than a generic upsell.
const FREE_DEALS_PER_CATEGORY = 3;

// This week's curated flyer deals (Airtable Admin Review Tool, status
// "deals"/"both" -> curated_deals), grouped into collapsible category
// sections since there are too many to browse as one flat list. Each deal
// can be added straight to the grocery list without going through a
// recipe.
export default function BestDealsScreen() {
  const { isSubscribed } = useSubscription();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const { selectedDealIds, toggleDealSelected } = useSelectedDeals();

  useEffect(() => {
    fetchAllDeals()
      .then(setDeals)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  function toggleCategory(category: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#111" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>We couldn't load this week's deals. Please try again.</Text>
      </View>
    );
  }

  const groups = groupDealsByCategory(deals);
  const categories = Array.from(groups.keys()).sort();

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Weekly Deals</Text>
        <Text style={styles.subtitle}>
          {deals.length} deal{deals.length === 1 ? '' : 's'} this week · {categories.length} categor
          {categories.length === 1 ? 'y' : 'ies'}
        </Text>

        {deals.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No deals available right now. Check back soon.</Text>
          </View>
        )}

        {categories.map((category) => {
          const categoryDeals = groups.get(category)!;
          const visibleDeals = isSubscribed
            ? categoryDeals
            : categoryDeals.slice(0, FREE_DEALS_PER_CATEGORY);
          const lockedDealCount = categoryDeals.length - visibleDeals.length;
          const isExpanded = expandedCategories.has(category);
          return (
            <View key={category} style={styles.categorySection}>
              <Pressable style={styles.categoryHeader} onPress={() => toggleCategory(category)}>
                <Text style={styles.categoryTitle}>{category}</Text>
                <View style={styles.categoryHeaderRight}>
                  <View style={styles.categoryCountBadge}>
                    <Text style={styles.categoryCount}>{categoryDeals.length}</Text>
                  </View>
                  {isExpanded ? (
                    <ChevronDownIcon size={16} color={INK} />
                  ) : (
                    <ChevronRightIcon size={16} color={INK} />
                  )}
                </View>
              </Pressable>

              {isExpanded && (
                <View style={styles.dealsGrid}>
                  {visibleDeals.map((deal) => {
                    const isAdded = selectedDealIds.has(deal.id);
                    return (
                      <View key={deal.id} style={styles.dealCard}>
                        <Pressable style={styles.dealCardTop} onPress={() => Linking.openURL(deal.productUrl)}>
                          <View style={styles.dealImageWrap}>
                            {deal.imageUrl ? (
                              <Image source={{ uri: deal.imageUrl }} style={styles.dealImage} />
                            ) : (
                              <View style={[styles.dealImage, styles.dealImagePlaceholder]}>
                                <TagIcon size={24} color="#ccc" />
                              </View>
                            )}
                          </View>
                          <View style={styles.dealInfo}>
                            {/* No numberOfLines -- the full item name always
                                shows, never truncated with an ellipsis. */}
                            <Text style={styles.dealName}>{deal.itemName}</Text>
                            <Text style={styles.dealChain} numberOfLines={1}>
                              {deal.chainName}
                            </Text>
                            {/* Same "See in flyer" affordance as
                                IngredientRow's showStoreLink -- muted/
                                no-underline when there's no real flyer
                                link to give (produce-gap-sourced deals),
                                same as there, rather than a dead link. */}
                            <Pressable
                              style={styles.flyerLinkRow}
                              onPress={deal.productUrl ? () => Linking.openURL(deal.productUrl) : undefined}
                              disabled={!deal.productUrl}
                              hitSlop={4}
                            >
                              <Text style={[styles.flyerLink, !deal.productUrl && styles.flyerLinkDisabled]}>
                                See in flyer
                              </Text>
                              <ArrowOutwardIcon size={12} color={deal.productUrl ? INK : '#999'} />
                            </Pressable>
                            <View style={styles.priceRow}>
                              <Text style={styles.dealPrice}>${deal.price.toFixed(2)}</Text>
                              {showsRealDiscount(deal.discountPct, deal.originalPriceSource) && (
                                <Text style={styles.dealOriginalPrice}>
                                  ${deal.originalPrice.toFixed(2)}
                                </Text>
                              )}
                            </View>
                            {isReferencePriced(deal.originalPriceSource) && (
                              <Text style={styles.dealCompareAnnotation}>
                                {formatComparePriceLabel(deal.originalPrice)}
                              </Text>
                            )}
                            {/* Moved off the image overlay (was cramped/
                                wrapping awkwardly on the smaller 88px
                                horizontal-row image) -- same three-way
                                discount/great-value/fair-price badge, now
                                inline beside the price like IngredientRow's
                                own default (non-stacked) priceEl. */}
                            {showsRealDiscount(deal.discountPct, deal.originalPriceSource) ? (
                              <View style={styles.dealBadge}>
                                <Text style={styles.dealBadgeText}>
                                  Up to {Math.round(deal.discountPct)}% off
                                </Text>
                              </View>
                            ) : isGreatReferenceValue(deal.discountPct, deal.originalPriceSource) ? (
                              <View style={styles.dealGreatValueBadge}>
                                <Text style={styles.dealGreatValueBadgeText}>
                                  {formatGreatReferenceValueLabel(deal.discountPct)}
                                </Text>
                              </View>
                            ) : (
                              <View style={styles.dealFairPriceBadge}>
                                <Text style={styles.dealFairPriceBadgeText}>Fair price</Text>
                              </View>
                            )}
                          </View>
                        </Pressable>
                        {/* Icon-only primary button, top-right corner of the
                            card (Anabelle's call) -- was a full text button
                            ("+ Add to grocery list") below the content.
                            Same ACCENT/INK-fill active-state flip as
                            before, just a circular Plus/Check icon now. */}
                        <Pressable
                          style={[styles.addIconButton, isAdded && styles.addIconButtonActive]}
                          onPress={() => toggleDealSelected(deal.id)}
                          hitSlop={6}
                        >
                          {isAdded ? (
                            <CheckIcon size={16} color="#fff" />
                          ) : (
                            <PlusIcon size={16} color={INK} />
                          )}
                        </Pressable>
                      </View>
                    );
                  })}
                  {lockedDealCount > 0 && (
                    <Pressable
                      style={styles.unlockCard}
                      onPress={() =>
                        router.push({
                          pathname: '/upgrade',
                          params: {
                            reason: `see ${lockedDealCount} more ${category.toLowerCase()} deal${lockedDealCount === 1 ? '' : 's'}`,
                          },
                        })
                      }
                    >
                      <LockClosedIcon size={20} color={INK} />
                      <Text style={styles.unlockTitle}>
                        Unlock {lockedDealCount} more deal{lockedDealCount === 1 ? '' : 's'}
                      </Text>
                      <Text style={styles.unlockSubtitle}>30-day free trial · Then $5.99/mo</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Matches meals.tsx/GroceryListView.tsx's own peach background --
  // was plain/transparent (defaulting to white), the biggest single
  // mismatch against the rest of the app.
  container: { flex: 1, backgroundColor: '#FFEAD4' },
  centered: { alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 14, color: '#767676', textAlign: 'center', paddingHorizontal: 24 },
  // paddingBottom generous (not the old plain 20/via shorthand `padding`)
  // so the last category's own content never lands under SupportBubble --
  // same fixed floating chat button/clearance issue GroceryListView.tsx
  // already fixed for its own last card.
  scrollContent: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 140, gap: 20 },
  title: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  subtitle: { fontSize: 13, color: INK, marginTop: -12 },
  // "Modal treatment" -- same white/2px-INK-border/16px-radius language
  // as every other card on the Meals/Grocery/Recipe screens (was flat
  // #F2F2F2 grey box with no border).
  emptyState: { backgroundColor: '#fff', borderWidth: 2, borderColor: INK, borderRadius: 16, padding: 20 },
  emptyStateText: { color: INK, fontSize: 14, textAlign: 'center' },
  categorySection: { gap: 10 },
  // "Modal treatment" header, matching recipe.tsx's own card-with-
  // heading-row convention -- was a thin #eee-border/12px-radius box,
  // visually unrelated to any other card on the app.
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  // 700/Bold, not 800/ExtraBold -- matches this app's established
  // section-heading weight (recipe.tsx's sectionTitle, GroceryListView's
  // storeName/selectedSectionTitle), not the page-title weight.
  categoryTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  categoryHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // ACCENT-filled pill, matching the brand-accent badges used elsewhere
  // (e.g. sheetDoneButton) -- was plain muted-grey text with no badge.
  categoryCountBadge: {
    backgroundColor: ACCENT,
    borderRadius: 999,
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryCount: { fontSize: 13, color: INK, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  // Plain vertical stack now (Anabelle's call) -- was a 2-col wrapped
  // grid (width: '47%' cards); each deal card is now its own full-width
  // horizontal row instead.
  dealsGrid: { gap: 12 },
  // "Modal treatment" card, full width -- was a half-width grid item
  // with the image stacked on top of the text.
  // position: relative -- anchors the icon-only Add button (absolute)
  // to this card's own top-right corner.
  dealCard: {
    width: '100%',
    position: 'relative',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 16,
    padding: 10,
    gap: 10,
  },
  // Image left, name/store/price column right -- same horizontal-row
  // shape as IngredientRow's own default (non-stacked) layout.
  dealCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  // paddingRight reserves room for the top-right icon-only Add button
  // (absolute, doesn't take up flex space on its own) -- otherwise an
  // untruncated long item name could wrap right underneath it.
  dealInfo: { flex: 1, gap: 2, paddingRight: 36 },
  // Same INK-border convention as meals.tsx's own unlock card (1px,
  // not the 2px "modal treatment" cards use -- this one has no white
  // fill of its own, transparent against the page). Full width now,
  // matching dealCard above.
  unlockCard: {
    width: '100%',
    borderWidth: 1,
    borderColor: INK,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  unlockTitle: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'OpenSans_800ExtraBold',
    color: INK,
    textAlign: 'center',
  },
  unlockSubtitle: { fontSize: 11, color: '#767676', textAlign: 'center' },
  dealImageWrap: { position: 'relative' },
  // Fixed square now (was width: '100%' of a stacked card) -- sits to
  // the left of the info column in the new horizontal row.
  dealImage: { width: 88, height: 88, borderRadius: 10, backgroundColor: '#F2F2F2' },
  dealImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  // Pill badges, inline beside the price (was an absolute overlay on
  // the image, cramped/wrapping awkwardly on the smaller 88px
  // horizontal-row image) -- matches MealCard.tsx's own dealTagBadge/
  // fairPriceBadge/greatValueBadge exactly (light-bg/colored-text
  // pills), not IngredientRow's solid-bg/white-text rounded-rect --
  // this app's own Meals tab is the more relevant precedent for a
  // recipe/deal card's badge, so this now matches that instead.
  dealBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: '#96E696',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dealBadgeText: { color: INK, fontSize: 12, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  // Peach/orange -- distinct from dealBadge's green (a real store
  // discount), matching MealCard's fairPriceBadge exactly.
  dealFairPriceBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: '#FFEAD4',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dealFairPriceBadgeText: { color: '#FF7A2A', fontSize: 12, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  // Purple -- deliberately distinct from dealBadge's green (a real
  // store discount) and dealFairPriceBadge's peach (a neutral price),
  // matching MealCard's greatValueBadge exactly.
  dealGreatValueBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: '#EDE7FE',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dealGreatValueBadgeText: { color: '#6B46C1', fontSize: 12, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  // No marginTop/minHeight now (were sized for the old stacked
  // layout, image-above-text) -- dealName sits beside the image now,
  // in dealInfo's own flex column.
  dealName: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  dealChain: { fontSize: 11, color: '#767676' },
  // Same "See in flyer" convention as IngredientRow's own
  // flyerLinkRow/flyerLink/flyerLinkDisabled -- identical values, so
  // this affordance reads the same wherever it shows up in the app.
  flyerLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  flyerLink: {
    fontSize: 12,
    color: INK,
    fontWeight: '700',
    fontFamily: 'OpenSans_700Bold',
    textDecorationLine: 'underline',
  },
  flyerLinkDisabled: { color: '#999', textDecorationLine: 'none' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 },
  // 16px, matching IngredientRow's own itemPriceValue -- was 15px.
  dealPrice: { fontSize: 16, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  // INK strikethrough at 11px, matching IngredientRow's own
  // itemPriceOriginal exactly -- was a muted #aaa grey at 12px.
  dealOriginalPrice: { fontSize: 11, color: INK, textDecorationLine: 'line-through' },
  // Matches IngredientRow.tsx's itemPriceEstimated deliberately -- same
  // "not a confirmed store fact" muted tone, reused here for a
  // reference-sourced original price instead of a non-deal staple avg.
  dealCompareAnnotation: { fontSize: 12, color: '#767676' },
  // ACCENT-filled pill, matching recipe.tsx's addToListButton/MealCard's
  // groceryToggleButton convention exactly (same active-state flip to
  // INK fill + white text) -- was an unfilled thin-border button, the
  // Icon-only primary button (Anabelle's call), pinned to the card's
  // own top-right corner -- was a full-width text button
  // ("+ Add to grocery list") below the content, then a compact text
  // pill. Same ACCENT/INK-fill active-state flip as those had, just a
  // circular Plus/Check icon now instead of a text label.
  addIconButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ACCENT,
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addIconButtonActive: { backgroundColor: INK },
});
