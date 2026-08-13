import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, LockClosedIcon, TagIcon } from 'react-native-heroicons/outline';

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

        {/* One shared "modal treatment" card for every category (Anabelle's
            call) -- was each category its own separate white-bordered
            card, stacked with a gap between them. A thin divider (not
            each row's own border) now separates categories, same
            convention as recipe.tsx's dealDivider/sectionDivider inside
            its own single "What you'll need" card. */}
        {categories.length > 0 && (
          <View style={styles.categoriesCard}>
            {categories.map((category, index) => {
              const categoryDeals = groups.get(category)!;
              const visibleDeals = isSubscribed
                ? categoryDeals
                : categoryDeals.slice(0, FREE_DEALS_PER_CATEGORY);
              const lockedDealCount = categoryDeals.length - visibleDeals.length;
              const isExpanded = expandedCategories.has(category);
              return (
                <View key={category}>
                  {index > 0 && <View style={styles.categoryDivider} />}
                  <Pressable style={styles.categoryHeader} onPress={() => toggleCategory(category)}>
                    <Text style={styles.categoryTitle}>{category}</Text>
                    <View style={styles.categoryHeaderRight}>
                      <Text style={styles.categoryCount}>{categoryDeals.length}</Text>
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
                            <Pressable onPress={() => Linking.openURL(deal.productUrl)}>
                              <View style={styles.dealImageWrap}>
                                {deal.imageUrl ? (
                                  <Image source={{ uri: deal.imageUrl }} style={styles.dealImage} />
                                ) : (
                                  <View style={[styles.dealImage, styles.dealImagePlaceholder]}>
                                    <TagIcon size={24} color="#ccc" />
                                  </View>
                                )}
                                {showsRealDiscount(deal.discountPct, deal.originalPriceSource) ? (
                                  <View style={styles.discountBadge}>
                                    <Text style={styles.discountBadgeText}>
                                      Up to {Math.round(deal.discountPct)}% off
                                    </Text>
                                  </View>
                                ) : isGreatReferenceValue(deal.discountPct, deal.originalPriceSource) ? (
                                  <View style={styles.greatValueBadge}>
                                    <Text style={styles.discountBadgeText}>
                                      {formatGreatReferenceValueLabel(deal.discountPct)}
                                    </Text>
                                  </View>
                                ) : (
                                  <View style={styles.fairPriceBadge}>
                                    <Text style={styles.fairPriceBadgeText}>Fair price</Text>
                                  </View>
                                )}
                              </View>
                              <Text style={styles.dealName} numberOfLines={2}>
                                {deal.itemName}
                              </Text>
                              <Text style={styles.dealChain} numberOfLines={1}>
                                {deal.chainName}
                              </Text>
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
                            </Pressable>
                            <Pressable
                              style={[styles.addButton, isAdded && styles.addButtonActive]}
                              onPress={() => toggleDealSelected(deal.id)}
                            >
                              {isAdded && <CheckIcon size={12} color="#fff" />}
                              <Text style={[styles.addButtonText, isAdded && styles.addButtonTextActive]}>
                                {isAdded ? 'Added' : '+ Add to grocery list'}
                              </Text>
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
  scrollContent: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 140, gap: 20 },
  title: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  subtitle: { fontSize: 13, color: INK, marginTop: -12 },
  // "Modal treatment" -- same white/2px-INK-border/16px-radius language
  // as every other card on the Meals/Grocery/Recipe screens (was flat
  // #F2F2F2 grey box with no border).
  emptyState: { backgroundColor: '#fff', borderWidth: 2, borderColor: INK, borderRadius: 16, padding: 20 },
  emptyStateText: { color: INK, fontSize: 14, textAlign: 'center' },
  // One shared "modal treatment" card for every category (Anabelle's
  // call) -- was each category its own separate white-bordered card.
  // Same white/2px-INK-border/16px-radius/14px-padding language as
  // every other card on this screen, just holding every category row
  // instead of one deal grid directly.
  categoriesCard: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 16,
    padding: 14,
  },
  // Separates category rows within the shared card -- same #E8E8E8
  // thin-rule convention as recipe.tsx's sectionDivider/dealDivider.
  // Not rendered before the first category (see index > 0 check).
  categoryDivider: { height: 1, backgroundColor: '#E8E8E8', marginVertical: 14 },
  // Plain row now (no border/bg/radius of its own -- that lives on the
  // shared categoriesCard above), just the tap target for expand/
  // collapse.
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  // 700/Bold, not 800/ExtraBold -- matches this app's established
  // section-heading weight (recipe.tsx's sectionTitle, GroceryListView's
  // storeName/selectedSectionTitle), not the page-title weight.
  categoryTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  categoryHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  categoryCount: { fontSize: 13, color: '#767676', fontWeight: '600', fontFamily: 'OpenSans_600SemiBold' },
  // marginTop separates the grid from its own category row above --
  // previously implicit via categorySection's own gap, now needed
  // explicitly since categoryHeader no longer sits in a gapped wrapper.
  dealsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  // "Modal treatment" card -- was a thin #eee-border/14px-radius box.
  dealCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 16,
    padding: 10,
    gap: 4,
  },
  // Same INK-border convention as meals.tsx's own grid-adjacent unlock
  // card (1px, not the 2px "modal treatment" cards use -- this one has
  // no white fill of its own, transparent against the page).
  unlockCard: {
    width: '47%',
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
  dealImage: { width: '100%', height: 90, borderRadius: 10, backgroundColor: '#F2F2F2' },
  dealImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  // Solid-bg/white-text overlay badges -- already matched
  // IngredientRow.tsx's own non-stacked discountBadge/fairPriceBadge/
  // greatValueBadge colors exactly (needed for contrast against an
  // arbitrary flyer photo, unlike the light-pill variant used for
  // inline badges elsewhere), left as-is.
  discountBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: '#2C5FD6',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  discountBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  fairPriceBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: '#FF7A2A',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  fairPriceBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  // Purple -- deliberately distinct from discountBadge's blue (a real
  // store markdown) and fairPriceBadge's yellow (a neutral price), so
  // "we compared this and it's genuinely a good price" never reads as
  // either of those two claims.
  greatValueBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: '#6B46C1',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dealName: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'OpenSans_700Bold',
    color: INK,
    marginTop: 4,
    minHeight: 34,
  },
  dealChain: { fontSize: 11, color: '#767676' },
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
  // one outstanding primary-action control on this screen that hadn't
  // picked up the app's own brand-accent treatment.
  addButton: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: ACCENT,
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 999,
    paddingVertical: 8,
    alignItems: 'center',
  },
  addButtonActive: { backgroundColor: INK },
  addButtonText: { fontSize: 11, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  addButtonTextActive: { color: '#fff' },
});
