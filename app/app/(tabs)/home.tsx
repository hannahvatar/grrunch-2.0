import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ArrowLink } from '../../components/ArrowLink';
import { ClosingSoonBanner } from '../../components/ClosingSoonBanner';
import { MealCard } from '../../components/MealCard';
import { UpgradeCta } from '../../components/UpgradeCta';
import { WeekGapState } from '../../components/WeekGapState';
import {
  bySavingsDesc,
  type Deal,
  fetchAllDeals,
  formatDealBadgePrice,
  formatGreatReferenceValueLabel,
  formatRealDiscountLabel,
  groupDealsByCategory,
  isGreatReferenceValue,
  priceUnitSuffix,
  selectVisibleDeals,
  showsRealDiscount,
  toTitleCase,
} from '../../lib/curatedDeals';
import { filterDealsByZone } from '../../lib/dealZones';
import { gridSpan, useIsDesktop } from '../../lib/layout';
import { useLiveWeek, useWeekValidityLabel } from '../../lib/liveWeek';
import type { Meal } from '../../lib/mealData';
import { sortMealsByBestDeal } from '../../lib/mealScaling';
import { fetchAllRecipes } from '../../lib/recipes';
import { useSelectedMeals } from '../../lib/selectedMeals';
import { useSelectedStores } from '../../lib/selectedStores';
import { applyStoreFilter, useStoreFilter } from '../../lib/storeFilter';
import { useSubscription } from '../../lib/subscription';

const INK = '#111';
const MEALS_SHOWN = 3;
const DEALS_SHOWN = 5;
// Same free-tier caps as Meals (3 picked recipes) and Weekly Deals (1 per
// category), so Home never shows a non-member anything those pages lock.
const FREE_DEALS_PER_CATEGORY = 1;

// Web-only Home tab (Anabelle, 2026-10-23: "the web app needs a
// homepage"), where web visitors land after onboarding/sign-in: this
// week's dates, a few meals, the best deals, and the trial card for
// non-members. Hidden from the iPhone tab bar ((tabs)/_layout.tsx).
// Reuses the Meals and Weekly Deals selection rules exactly (featured
// recipes best-deal first, free-preview picks for non-members; deals
// best savings first within the store chips and zone filter).
export default function HomeScreen() {
  const isDesktop = useIsDesktop();
  const { width: windowWidth } = useWindowDimensions();
  const desktopContent = isDesktop ? { width: gridSpan(windowWidth, 8), alignSelf: 'center' as const, paddingHorizontal: 0 } : null;

  const { isSubscribed } = useSubscription();
  const { selectedIds, toggleSelected } = useSelectedMeals();
  const { hiddenChains } = useStoreFilter();
  const { stores: myStores } = useSelectedStores();
  const liveWeek = useLiveWeek();
  const weekValidity = useWeekValidityLabel();
  const weekClosed = liveWeek?.closed ?? false;

  const [allMeals, setAllMeals] = useState<Meal[]>([]);
  const [allDeals, setAllDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchAllRecipes(), fetchAllDeals()])
      .then(([meals, deals]) => {
        setAllMeals(meals);
        setAllDeals(deals);
      })
      .catch(() => {
        router.replace({ pathname: '/error', params: { body: "We couldn't load this week's picks. Please try again." } });
      })
      .finally(() => setLoading(false));
  }, [liveWeek?.publishedAt]);

  // Same gate as Meals' "Add to list".
  function handleToggleSelected(mealId: string) {
    if (!isSubscribed) {
      router.push({ pathname: '/upgrade', params: { reason: 'add recipes to your grocery list' } });
      return;
    }
    toggleSelected(mealId);
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
        <ActivityIndicator size="large" color={INK} />
      </View>
    );
  }

  const featured = sortMealsByBestDeal(
    allMeals.map((meal) => applyStoreFilter(meal, hiddenChains)).filter((meal) => meal.featured)
  );
  const picked = featured.filter((meal) => meal.freePreview);
  const meals = (isSubscribed || picked.length === 0 ? featured : picked).slice(0, MEALS_SHOWN);

  const shownDeals = filterDealsByZone(allDeals, myStores).filter((deal) => !hiddenChains.has(deal.chainName));
  const visibleDeals = Array.from(groupDealsByCategory(shownDeals).values()).flatMap(
    (categoryDeals) => selectVisibleDeals(categoryDeals, isSubscribed, FREE_DEALS_PER_CATEGORY).visibleDeals
  );
  const topDeals = [...visibleDeals].sort(bySavingsDesc).slice(0, DEALS_SHOWN);

  return (
    <View style={styles.container}>
      <ClosingSoonBanner />
      <ScrollView contentContainerStyle={[styles.scrollContent, desktopContent]}>
        <View>
          <Text style={styles.title}>This week at Grrunch</Text>
          {weekValidity && <Text style={styles.weekValidity}>{weekValidity}</Text>}
          <Text style={styles.tagline}>The best deals from this week's flyers, and the recipes we made from them.</Text>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>This week's recipes</Text>
          <ArrowLink label="See all recipes" onPress={() => router.navigate('/recipes')} />
        </View>
        {meals.map((meal) => (
          <MealCard
            key={meal.id}
            meal={meal}
            isSelected={selectedIds.has(meal.id)}
            onToggleSelected={() => handleToggleSelected(meal.id)}
            locked={!isSubscribed}
          />
        ))}

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Top deals</Text>
          <ArrowLink label="See all deals" onPress={() => router.navigate('/best-deals')} />
        </View>
        <View style={styles.dealsCard}>
          {topDeals.map((deal, index) => (
            <DealRow key={deal.id} deal={deal} first={index === 0} />
          ))}
        </View>

        {!isSubscribed && <UpgradeCta reason="unlock every recipe and deal" />}
      </ScrollView>
    </View>
  );
}

// Compact deal row: cutout, name, store, price and the same savings badge
// Weekly Deals shows. Tapping it opens Weekly Deals.
function DealRow({ deal, first }: { deal: Deal; first: boolean }) {
  const price = formatDealBadgePrice(deal.price, deal.priceUnit, deal.packageWeightG);
  const suffix = priceUnitSuffix(deal.priceUnit, deal.packageWeightG);
  return (
    <Pressable style={[styles.dealRow, !first && styles.dealRowDivider]} onPress={() => router.navigate('/best-deals')}>
      {deal.imageUrl ? (
        <Image source={{ uri: deal.imageUrl }} style={styles.dealImage} resizeMode="cover" />
      ) : (
        <View style={styles.dealImage} />
      )}
      <View style={styles.dealInfo}>
        <Text style={styles.dealName} numberOfLines={2}>
          {toTitleCase(deal.itemName)}
        </Text>
        <Text style={styles.dealStore}>{deal.chainName}</Text>
      </View>
      <View style={styles.dealPriceBlock}>
        <Text style={styles.dealPrice}>
          ${price.toFixed(2)}
          {suffix}
        </Text>
        {showsRealDiscount(deal.discountPct, deal.originalPriceSource) ? (
          <View style={[styles.badge, styles.badgeDiscount]}>
            <Text style={[styles.badgeText, styles.badgeDiscountText]}>{formatRealDiscountLabel(deal.discountPct)}</Text>
          </View>
        ) : isGreatReferenceValue(deal.discountPct, deal.originalPriceSource) ? (
          <View style={[styles.badge, styles.badgeGreat]}>
            <Text style={[styles.badgeText, styles.badgeGreatText]}>{formatGreatReferenceValueLabel(deal.discountPct)}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFEAD4' },
  centered: { alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 140, gap: 16 },
  title: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  weekValidity: { fontSize: 14, color: '#343837', marginTop: 2 },
  tagline: { fontSize: 16, lineHeight: 24, color: INK, marginTop: 8 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  sectionTitle: { fontSize: 20, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  dealsCard: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  dealRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  dealRowDivider: { borderTopWidth: 1, borderTopColor: '#E0C9AE' },
  dealImage: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#F5F0EA' },
  dealInfo: { flex: 1, gap: 2 },
  dealName: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  dealStore: { fontSize: 14, color: '#767676' },
  dealPriceBlock: { alignItems: 'flex-end', gap: 4 },
  dealPrice: { fontSize: 16, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  // Same badge colors as Weekly Deals (blue = real store discount,
  // purple = great value against a reference price).
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  badgeDiscount: { backgroundColor: '#E3ECFD' },
  badgeDiscountText: { color: '#2C5FD6' },
  badgeGreat: { backgroundColor: '#EDE7FE' },
  badgeGreatText: { color: '#6B46C1' },
});
