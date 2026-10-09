import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  LockClosedIcon,
  MagnifyingGlassPlusIcon,
  PlusIcon,
  TagIcon,
} from 'react-native-heroicons/outline';

import {
  type Deal,
  fetchAllDeals,
  formatComparePriceLabel,
  priceUnitSuffix,
  formatGreatReferenceValueLabel,
  formatRealDiscountLabel,
  groupDealsByCategory,
  isGreatReferenceValue,
  isReferencePriced,
  selectVisibleDeals,
  showsRealDiscount,
} from '../../lib/curatedDeals';
import { STORE_CHAINS } from '../../lib/storeFilter';
import { AlertBanner } from '../../components/AlertBanner';
import { CutoutViewer } from '../../components/CutoutViewer';
import { ExpiredBadge } from '../../components/ExpiredBadge';
import { ArrowOutwardIcon } from '../../components/MaterialSymbols';
import { filterDealsByZone } from '../../lib/dealZones';
import { FRESH_DEALS_BANNER_BODY, FRESH_DEALS_BANNER_TITLE, useLiveWeek } from '../../lib/liveWeek';
import { ClosingSoonBanner } from '../../components/ClosingSoonBanner';
import { StoreChips } from '../../components/StoreChips';
import { WeekGapState } from '../../components/WeekGapState';
import { MONTHLY_PRICE_DISPLAY } from '../../lib/purchases';
import { useSelectedDeals } from '../../lib/selectedDeals';
import { useSelectedStores } from '../../lib/selectedStores';
import { useStoreFilter } from '../../lib/storeFilter';
import { useSubscription } from '../../lib/subscription';

// GRRUNCH DS -- matches meals.tsx/recipe.tsx/GroceryListView.tsx's own
// peach background + white/2px-INK-border "modal treatment" card
// language, pulled over onto this screen (previously still on an
// earlier, plainer white-bg/thin-grey-border look that had drifted
// from the rest of the app).
const ACCENT = '#FFA955';
const EMPTY_GREY = '#9A9A9A';

// Category count badge color by how much of the category's deals (across
// every store) the store chips still show (Anabelle, 2026-10-02): green
// above 75%, yellow from 25% to 75%, red under 25%, grey at none (the
// row itself greys out too). With every store selected it's always green.
// Yellow is a true yellow, not AlertBanner's amber warning, which reads
// too close to the orange "Fair price" pill; red/grey reuse AlertBanner's
// error/neutral colors.
function countBadgeColors(shown: number, total: number): { bg: string; text: string } {
  if (shown === 0) return { bg: '#F2F2F2', text: '#6B6B6B' };
  const share = shown / total;
  if (share > 0.75) return { bg: '#E8F5E9', text: '#1E7B34' };
  if (share >= 0.25) return { bg: '#FFF6C7', text: '#8A6A00' };
  return { bg: '#FDECEC', text: '#B42318' };
}
const INK = '#111';

// Free tier sees only the single biggest-savings non-recipe-linked item
// in each category (was 3, Anabelle 2026-09-08) -- see selectVisibleDeals,
// which already sorts by savings desc before slicing, so this is "the one
// with the best deal percentage" by construction. Grrunch Plus (30-day
// free trial, then MONTHLY_PRICE_DISPLAY/mo) unlocks the rest. A deal used by any recipe
// is exempt from this cap entirely, always shown regardless of how many
// others are already visible. The "Unlock N more deals" dashed card
// stands in for however many non-recipe-linked deals are left, naming the
// real count rather than a generic upsell.
const FREE_DEALS_PER_CATEGORY = 1;

// This week's curated flyer deals (Airtable Admin Review Tool, status
// "deals"/"both" -> curated_deals), grouped into collapsible category
// sections since there are too many to browse as one flat list. Each deal
// can be added straight to the grocery list without going through a
// recipe.
export default function BestDealsScreen() {
  const { isSubscribed } = useSubscription();
  const [allDeals, setAllDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  // Anabelle, 2026-10-09: reorganise by best value (category sections,
  // best value first -- the default) or per store (one section per store).
  const [sortMode, setSortMode] = useState<'value' | 'store'>('value');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  // Cutout shown full screen (tap a deal's thumbnail) -- one viewer for
  // the whole page rather than one per deal.
  const [zoomUri, setZoomUri] = useState<string | null>(null);
  // Store chips (shared with Meals and My list, lib/storeFilter.tsx):
  // an unselected chain's deals are hidden here.
  const { hiddenChains } = useStoreFilter();
  const { selectedDealIds, toggleDealSelected } = useSelectedDeals();
  const { stores: myStores } = useSelectedStores();
  // Last week's flyers have ended but this week isn't published yet --
  // see lib/liveWeek.ts.
  // Weekly gap: between the Wednesday 11:59 pm close and the Thursday noon
  // publish, the whole screen is the "new deals are coming" state.
  const liveWeek = useLiveWeek();
  const weekExpired = liveWeek?.expired ?? false;
  const weekClosed = liveWeek?.closed ?? false;

  // Excludes a deal only when it's actually zone-tagged AND that tag
  // disagrees with the zone the user's own selected store (for that same
  // chain) is nearest to -- see lib/dealZones.ts's own header comment for
  // why this stays conservative given how incomplete zone tagging still
  // is (Anabelle, 2026-09-14: a Real Canadian Superstore outside the
  // Burnaby/urban zone shouldn't silently show that zone's pricing).
  // Recomputed from `myStores` reactively (not re-fetched) so editing a
  // store in Profile updates this list without a network round trip.
  const deals = filterDealsByZone(allDeals, myStores);

  // Membership-gated, same shape as meals.tsx's handleToggleSelected /
  // recipe.tsx's handleAddToList (Anabelle, 2026-09-09: "With a free
  // account BUT NOT MEMBERSHIP you CANT add to your grocery list") -- a
  // deliberate product gate (lib/selectedDeals is plain in-memory state,
  // no account needed to use it), not a technical one. Was isGuest-only;
  // a free (signed-in, non-member) tap now gets the same /upgrade prompt
  // as a guest instead of calling toggleDealSelected.
  function handleAddDeal(dealId: string) {
    if (!isSubscribed) {
      router.push({ pathname: '/upgrade', params: { reason: 'add deals to your grocery list' } });
      return;
    }
    toggleDealSelected(dealId);
  }

  // Re-fetched when a new week is published, so an open app shows the
  // new deals without a restart.
  useEffect(() => {
    fetchAllDeals()
      .then(setAllDeals)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [liveWeek?.publishedAt]);

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

  if (weekClosed) {
    return (
      <View style={styles.container}>
        <WeekGapState screen="deals" />
      </View>
    );
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

  const shownDeals = deals.filter((deal) => !hiddenChains.has(deal.chainName));
  // Categories come from ALL deals (every store) so a category the store
  // chips have emptied stays listed, greyed out; counts come from the
  // deals still shown.
  const byStore = (list: Deal[]) => {
    const map = new Map<string, Deal[]>();
    for (const deal of list) map.set(deal.chainName, [...(map.get(deal.chainName) ?? []), deal]);
    return map;
  };
  const allGroups = sortMode === 'store' ? byStore(deals) : groupDealsByCategory(deals);
  const groups = sortMode === 'store' ? byStore(shownDeals) : groupDealsByCategory(shownDeals);
  // Stores in the same order as the store chips; categories alphabetical.
  const categories =
    sortMode === 'store'
      ? STORE_CHAINS.filter((chain) => allGroups.has(chain))
      : Array.from(allGroups.keys()).sort();

  return (
    <View style={styles.container}>
      <ClosingSoonBanner />
      {zoomUri && <CutoutViewer uri={zoomUri} visible onClose={() => setZoomUri(null)} />}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, styles.titleFlex]}>Grrunch Picks</Text>
          <View style={styles.sortSection}>
            <Pressable style={styles.sortPill} onPress={() => setSortMenuOpen((open) => !open)}>
              <Text style={styles.sortPillText}>{sortMode === 'store' ? 'Per store' : 'Best savings'}</Text>
              <ChevronDownIcon size={16} color={INK} strokeWidth={2} />
            </Pressable>
            {sortMenuOpen && (
              <View style={styles.sortMenu}>
                {(
                  [
                    { mode: 'value', label: 'Best savings' },
                    { mode: 'store', label: 'Per store' },
                  ] as const
                ).map((option) => (
                  <Pressable
                    key={option.mode}
                    style={styles.sortMenuItem}
                    onPress={() => {
                      setSortMode(option.mode);
                      setExpandedCategories(new Set());
                      setSortMenuOpen(false);
                    }}
                  >
                    <Text style={styles.sortMenuItemText}>{option.label}</Text>
                    {sortMode === option.mode && <CheckIcon size={16} color={INK} strokeWidth={2} />}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
        {weekExpired && (
          <AlertBanner variant="info" title={FRESH_DEALS_BANNER_TITLE} description={FRESH_DEALS_BANNER_BODY} />
        )}
        {!weekExpired && (
          <Text style={styles.tagline}>We crunched the flyers and evaluated the offers. These deals actually made the cut.</Text>
        )}

        <StoreChips page="deals" />

        {deals.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No deals available right now. Check back soon.</Text>
          </View>
        )}
        {deals.length > 0 && shownDeals.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>Select a store above to see its deals.</Text>
          </View>
        )}

        {categories.length > 0 && (
        <View style={styles.categoryContainer}>
          {/* Top section of the category card: a label plus the count in a
              read-only, input-style box (Anabelle, 2026-10-05). The count
              follows the store chips. */}
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle}>{weekExpired ? "Deals from last week's flyers" : 'Deals this week'}</Text>
            <View style={styles.countField} accessibilityRole="text">
              <Text style={styles.countFieldText}>{shownDeals.length}</Text>
            </View>
          </View>
        {categories.map((category, categoryIndex) => {
          const categoryDeals = groups.get(category) ?? [];
          const { visibleDeals: rankedDeals, lockedDealCount } = selectVisibleDeals(
            categoryDeals,
            isSubscribed,
            FREE_DEALS_PER_CATEGORY
          );
          // Per store: grouped by category inside the store (stable sort,
          // so each category keeps its best-value-first order).
          const visibleDeals =
            sortMode === 'store'
              ? [...rankedDeals].sort((a, b) => a.category.localeCompare(b.category))
              : rankedDeals;
          const isEmpty = categoryDeals.length === 0;
          const isExpanded = !isEmpty && expandedCategories.has(category);
          const badge = countBadgeColors(categoryDeals.length, allGroups.get(category)!.length);
          return (
            <View
              key={category}
              style={[styles.categorySection, categoryIndex === categories.length - 1 && styles.categorySectionLast]}
            >
              <Pressable
                style={styles.categoryHeader}
                onPress={() => toggleCategory(category)}
                disabled={isEmpty}
                hitSlop={8}
              >
                <View style={styles.categoryTitleRow}>
                  <Text style={[styles.categoryTitle, isEmpty && styles.categoryTitleEmpty]}>{category}</Text>
                  <View style={[styles.categoryCountBadge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.categoryCount, { color: badge.text }]}>{categoryDeals.length}</Text>
                  </View>
                </View>
                <View style={styles.categoryHeaderRight}>
                  {isExpanded ? (
                    <ChevronUpIcon size={16} color={INK} />
                  ) : (
                    <ChevronDownIcon size={16} color={isEmpty ? EMPTY_GREY : INK} />
                  )}
                </View>
              </Pressable>

              {isExpanded && (
                <View style={styles.dealsGrid}>
                  {visibleDeals.map((deal, dealIndex) => {
                    const isAdded = selectedDealIds.has(deal.id);
                    const startsCategory =
                      sortMode === 'store' && (dealIndex === 0 || visibleDeals[dealIndex - 1].category !== deal.category);
                    return (
                      <View key={deal.id}>
                      {startsCategory && <Text style={styles.storeCategoryHeader}>{deal.category}</Text>}
                      <View style={[styles.dealCard, dealIndex > 0 && !startsCategory && styles.dealCardDivider]}>
                        <Pressable style={styles.dealCardTop} onPress={() => Linking.openURL(deal.productUrl)}>
                          {/* Tapping the thumbnail zooms the cutout (same as
                              recipe and grocery cards); the rest of the row
                              still opens the flyer. */}
                          {deal.imageUrl ? (
                            <Pressable
                              style={styles.dealImageWrap}
                              onPress={() => setZoomUri(deal.imageUrl)}
                              accessibilityRole="imagebutton"
                              accessibilityLabel="Enlarge flyer cutout"
                            >
                              <Image source={{ uri: deal.imageUrl }} style={styles.dealImage} />
                              <View style={styles.zoomHint} pointerEvents="none">
                                <MagnifyingGlassPlusIcon size={14} color="#fff" strokeWidth={2} />
                              </View>
                            </Pressable>
                          ) : (
                            <View style={styles.dealImageWrap}>
                              <View style={[styles.dealImage, styles.dealImagePlaceholder]}>
                                <TagIcon size={24} color="#ccc" />
                              </View>
                            </View>
                          )}
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
                              hitSlop={12}
                            >
                              <Text style={[styles.flyerLink, !deal.productUrl && styles.flyerLinkDisabled]}>
                                See in flyer
                              </Text>
                              <ArrowOutwardIcon size={12} color={deal.productUrl ? INK : '#999'} />
                            </Pressable>
                            <View style={styles.priceRow}>
                              <Text style={styles.dealPrice}>
                                ${deal.price.toFixed(2)}
                                {priceUnitSuffix(deal.priceUnit, deal.packageWeightG)}
                              </Text>
                              {showsRealDiscount(deal.discountPct, deal.originalPriceSource) && (
                                <Text style={styles.dealOriginalPrice}>
                                  ${deal.originalPrice.toFixed(2)}
                                  {priceUnitSuffix(deal.priceUnit, deal.packageWeightG)}
                                </Text>
                              )}
                            </View>
                            {isReferencePriced(deal.originalPriceSource) && (
                              <Text style={styles.dealCompareAnnotation}>
                                {formatComparePriceLabel(deal.originalPrice, priceUnitSuffix(deal.priceUnit, deal.packageWeightG))}
                              </Text>
                            )}
                            {/* Moved off the image overlay (was cramped/
                                wrapping awkwardly on the smaller 88px
                                horizontal-row image) -- same three-way
                                discount/great-value/fair-price badge, now
                                inline beside the price like IngredientRow's
                                own default (non-stacked) priceEl. */}
                            {weekExpired ? (
                              <ExpiredBadge />
                            ) : showsRealDiscount(deal.discountPct, deal.originalPriceSource) ? (
                              <View style={styles.dealBadge}>
                                <Text style={styles.dealBadgeText}>{formatRealDiscountLabel(deal.discountPct)}</Text>
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
                          onPress={() => handleAddDeal(deal.id)}
                          hitSlop={6}
                        >
                          {isAdded ? (
                            <CheckIcon size={20} color="#fff" />
                          ) : (
                            <PlusIcon size={20} color={INK} />
                          )}
                        </Pressable>
                      </View>
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
                            reason:
                              sortMode === 'store'
                                ? `see ${lockedDealCount} more deal${lockedDealCount === 1 ? '' : 's'} from ${category}`
                                : `see ${lockedDealCount} more ${category.toLowerCase()} deal${lockedDealCount === 1 ? '' : 's'}`,
                          },
                        })
                      }
                    >
                      <LockClosedIcon size={20} color={INK} />
                      <Text style={styles.unlockTitle}>
                        Unlock {lockedDealCount} more deal{lockedDealCount === 1 ? '' : 's'}
                      </Text>
                      <Text style={styles.unlockSubtitle}>30-day free trial · Then {MONTHLY_PRICE_DISPLAY}/mo · Cancel anytime</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          );
        })}
        </View>
        )}
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
  // paddingTop was 60 (clearing the status bar) -- the new persistent
  // AppTopBar ((tabs)/_layout.tsx) handles that now, but this screen still
  // wants its own top margin (Anabelle's call) for breathing room between
  // the white nav bar and the title below it -- previously had none.
  scrollContent: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 140, gap: 20 },
  title: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  // Same sort pill + menu as the Meals tab (meals.tsx). zIndex on the row
  // so the open menu paints over the deal card below.
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 20 },
  titleFlex: { flex: 1, marginRight: 12 },
  sortSection: { alignItems: 'flex-end' },
  sortPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: INK,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: 'center',
  },
  sortPillText: { fontSize: 13, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold', color: INK },
  sortMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 6,
    minWidth: 160,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: INK,
    borderRadius: 14,
    paddingVertical: 4,
    zIndex: 10,
    elevation: 4,
  },
  sortMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  sortMenuItemText: { fontSize: 13, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold', color: INK, flex: 1 },
  tagline: { fontSize: 14, color: INK, marginTop: -12 },
  // First section of categoryContainer (count title), divided off like
  // a category row.
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: INK,
  },
  // Same look as My list's quantity box (IngredientRow's
  // dealQuantityBadge): 44pt, 1px grey border, 6 radius, grey regular text.
  countField: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#767676',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countFieldText: { fontSize: 13, fontWeight: '400', fontFamily: 'OpenSans_400Regular', color: '#767676' },
  cardTitle: { fontSize: 16, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  // "Modal treatment" -- same white/2px-INK-border/16px-radius language
  // as every other card on the Meals/Grocery/Recipe screens (was flat
  // #F2F2F2 grey box with no border).
  emptyState: { backgroundColor: '#fff', borderWidth: 2, borderColor: INK, borderRadius: 16, padding: 20 },
  emptyStateText: { color: INK, fontSize: 14, textAlign: 'center' },
  // Same accordion treatment as get-support.tsx's FAQ (Anabelle,
  // 2026-10-02): one white card with a 1px INK border holding every
  // category, rows split by 1px INK dividers, chevron down/up. Was one
  // separate 2px-bordered pill per category.
  categoryContainer: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: INK,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  categorySection: { borderBottomWidth: 1, borderBottomColor: INK, paddingVertical: 16, gap: 12 },
  categorySectionLast: { borderBottomWidth: 0 },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  // 700/Bold, not 800/ExtraBold -- matches this app's established
  // section-heading weight (recipe.tsx's sectionTitle, GroceryListView's
  // storeName/selectedSectionTitle), not the page-title weight.
  // Name + count badge grouped on the left (badge right after the
  // name), chevron alone on the right.
  categoryTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  categoryTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  categoryTitleEmpty: { color: EMPTY_GREY },
  categoryHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // Colors come from countBadgeColors() (green/yellow/red/grey by how
  // much of the category the store chips still show) -- was the solid
  // ACCENT orange.
  categoryCountBadge: {
    borderRadius: 999,
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryCount: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  // Plain vertical stack now (Anabelle's call) -- was a 2-col wrapped
  // grid (width: '47%' cards); each deal card is now its own full-width
  // horizontal row instead.
  dealsGrid: {},
  // Plain list row inside the category accordion (Anabelle, 2026-10-02:
  // "remove the border around the individual items just use a
  // separator") -- was its own 2px-INK-bordered rounded card, which
  // read as a card inside a card. position: relative anchors the
  // icon-only Add button (absolute) to the row's top-right corner.
  // Category label inside a store section (Per store view).
  storeCategoryHeader: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'OpenSans_800ExtraBold',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingTop: 14,
    paddingBottom: 4,
  },
  dealCard: {
    width: '100%',
    position: 'relative',
    paddingVertical: 16,
    gap: 10,
  },
  // Light hairline between deals, deliberately softer than the 1px INK
  // dividers between categories so categories still read as the
  // sections and deals as the list inside one.
  dealCardDivider: { borderTopWidth: 1, borderTopColor: '#B8B0A7' },
  // Image left, name/store/price column right -- same horizontal-row
  // shape as IngredientRow's own default (non-stacked) layout.
  dealCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  // paddingRight reserves room for the top-right icon-only Add button
  // (absolute, doesn't take up flex space on its own) -- otherwise an
  // untruncated long item name could wrap right underneath it.
  dealInfo: { flex: 1, gap: 2, paddingRight: 52 },
  // Same INK-border convention as meals.tsx's own unlock card (1px,
  // not the 2px "modal treatment" cards use -- this one has no white
  // fill of its own, transparent against the page). Full width now,
  // matching dealCard above.
  // Dashed treatment (Anabelle, 2026-09-08) -- matches the app's other
  // dashed-outline locked/CTA cards (meals.tsx's unlockCard, MealCard's
  // groceryToggleButtonLocked, profile.tsx's changeStoreButton, etc.),
  // was a solid 1px border.
  unlockCard: {
    width: '100%',
    marginTop: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
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
  // Black (was #767676 grey) -- all type in this card reads INK now.
  unlockSubtitle: { fontSize: 11, color: INK, textAlign: 'center' },
  dealImageWrap: { position: 'relative' },
  // Fixed square now (was width: '100%' of a stacked card) -- sits to
  // the left of the info column in the new horizontal row.
  dealImage: { width: 88, height: 88, borderRadius: 10, backgroundColor: '#F2F2F2' },
  dealImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  // Same as IngredientRow's zoomHint.
  zoomHint: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    backgroundColor: 'rgba(17,17,17,0.7)',
    borderRadius: 999,
    padding: 5,
  },
  // Pill badges, inline beside the price (was an absolute overlay on
  // the image, cramped/wrapping awkwardly on the smaller 88px
  // horizontal-row image) -- matches MealCard.tsx's own dealTagBadge/
  // fairPriceBadge/greatValueBadge exactly (light-bg/colored-text
  // pills), not IngredientRow's solid-bg/white-text rounded-rect --
  // this app's own Meals tab is the more relevant precedent for a
  // recipe/deal card's badge, so this now matches that instead.
  //
  // Light-blue/blue store-discount scheme (#E3ECFD/#2C5FD6), kept in
  // lockstep with MealCard.tsx's dealTagBadge, IngredientRow.tsx's
  // dealDiscountBadge and how-it-works.tsx's tag table. Blue, not
  // green (Anabelle, 2026-10-02): green is reserved for success/
  // confirmation, so a store discount must not read as one.
  dealBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: '#E3ECFD',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dealBadgeText: { color: '#2C5FD6', fontSize: 12, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  // Peach/orange -- distinct from dealBadge's blue (a real store
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
  // Purple -- deliberately distinct from dealBadge's blue (a real
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
  // White tertiary treatment (Anabelle's call) -- same white-fill/
  // 1.5px-INK-border convention as settings.tsx's closeButton/
  // GroceryListView's editButton-removeMealButton, not an ACCENT-filled
  // primary. Was ACCENT-filled to match recipe.tsx's addToListButton/
  // MealCard's groceryToggleButton; still flips to INK fill + white
  // check on add, same as those, since that's a distinct "confirmed"
  // state rather than the idle button's own color.
  // Solid again (Anabelle, 2026-09-11) -- was switched to dashed on
  // 2026-09-08 to match unlockCard above; reverted back.
  addIconButton: {
    position: 'absolute',
    top: 16,
    right: 0,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addIconButtonActive: { backgroundColor: INK },
});
