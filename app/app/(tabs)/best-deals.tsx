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
                  <Text style={styles.categoryCount}>{categoryDeals.length}</Text>
                  {isExpanded ? (
                    <ChevronDownIcon size={16} color="#999" />
                  ) : (
                    <ChevronRightIcon size={16} color="#999" />
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
                      <LockClosedIcon size={20} color="#111" />
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
  container: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 14, color: '#888', textAlign: 'center', paddingHorizontal: 24 },
  scrollContent: { padding: 20, paddingTop: 60, gap: 20 },
  title: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  subtitle: { fontSize: 13, color: '#888', marginTop: -12 },
  emptyState: { backgroundColor: '#F2F2F2', borderRadius: 14, padding: 20 },
  emptyStateText: { color: '#666', fontSize: 14, textAlign: 'center' },
  categorySection: { gap: 10 },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  categoryTitle: { fontSize: 16, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  categoryHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  categoryCount: { fontSize: 13, color: '#999', fontWeight: '600', fontFamily: 'OpenSans_600SemiBold' },
  dealsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  dealCard: {
    width: '47%',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 14,
    padding: 10,
    gap: 4,
  },
  unlockCard: {
    width: '47%',
    borderWidth: 1,
    borderColor: '#111',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  unlockTitle: { fontSize: 13, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', textAlign: 'center' },
  unlockSubtitle: { fontSize: 11, color: '#888', textAlign: 'center' },
  dealImageWrap: { position: 'relative' },
  dealImage: { width: '100%', height: 90, borderRadius: 10, backgroundColor: '#F2F2F2' },
  dealImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
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
  // Peach/orange brand colors -- solid + white text, matching
  // discountBadge/greatValueBadge's own solid-bg convention on this
  // rounded-rect badge style.
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
  dealName: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', marginTop: 4, minHeight: 34 },
  dealChain: { fontSize: 11, color: '#999' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 },
  dealPrice: { fontSize: 15, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  dealOriginalPrice: { fontSize: 12, color: '#aaa', textDecorationLine: 'line-through' },
  // Matches IngredientRow.tsx's itemPriceEstimated deliberately -- same
  // "not a confirmed store fact" muted tone, reused here for a
  // reference-sourced original price instead of a non-deal staple avg.
  dealCompareAnnotation: { fontSize: 12, color: '#767676' },
  addButton: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#111',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  addButtonActive: { backgroundColor: '#111' },
  addButtonText: { fontSize: 11, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: '#111' },
  addButtonTextActive: { color: '#fff' },
});
