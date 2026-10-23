import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ChevronLeftIcon, ChevronRightIcon } from 'react-native-heroicons/outline';

import { ArrowLink } from '../../components/ArrowLink';
import { ClosingSoonBanner } from '../../components/ClosingSoonBanner';
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
import { getRecipeImage } from '../../lib/recipeImages';
import { fetchAllRecipes } from '../../lib/recipes';
import { useSelectedStores } from '../../lib/selectedStores';
import { applyStoreFilter, useStoreFilter } from '../../lib/storeFilter';
import { useSubscription } from '../../lib/subscription';

const INK = '#111';
// Recipe carousel (Anabelle, 2026-10-23): horizontal cards with a 400px
// photo on the left and a text column on the right. On a phone the card
// is narrower and stacks (photo on top) so it still fits.
const IMAGE_WIDTH = 400;
const TEXT_WIDTH = 320;
const CARD_WIDTH = IMAGE_WIDTH + TEXT_WIDTH;
const CARD_GAP = 16;
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
  // Same set as the Recipes tab: every recipe for members, the free picks
  // (or first 3) for everyone else.
  const meals = isSubscribed ? featured : (picked.length > 0 ? picked : featured).slice(0, 3);

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

        <RecipeCarousel meals={meals} isDesktop={isDesktop} windowWidth={windowWidth} />

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

// Horizontal, snapping row of recipe cards. Desktop gets arrow buttons
// (a mouse can't swipe); phone swipes.
function RecipeCarousel({ meals, isDesktop, windowWidth }: { meals: Meal[]; isDesktop: boolean; windowWidth: number }) {
  const scrollRef = useRef<ScrollView>(null);
  const [offset, setOffset] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const cardWidth = isDesktop ? CARD_WIDTH : Math.min(CARD_WIDTH, windowWidth - 72);
  const step = cardWidth + CARD_GAP;
  const contentWidth = meals.length * step - CARD_GAP;
  const atStart = offset <= 1;
  const atEnd = offset >= contentWidth - viewportWidth - 1;

  function scrollBy(direction: 1 | -1) {
    const next = Math.max(0, Math.round(offset / step + direction) * step);
    scrollRef.current?.scrollTo({ x: next, animated: true });
  }

  return (
    <>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>This week's recipes</Text>
        <View style={styles.sectionHeaderActions}>
          {isDesktop && meals.length > 1 && (
            <View style={styles.arrows}>
              <Pressable
                style={[styles.arrowButton, atStart && styles.arrowButtonDisabled]}
                onPress={() => scrollBy(-1)}
                disabled={atStart}
                accessibilityLabel="Previous recipes"
              >
                <ChevronLeftIcon size={18} color={INK} strokeWidth={2} />
              </Pressable>
              <Pressable
                style={[styles.arrowButton, atEnd && styles.arrowButtonDisabled]}
                onPress={() => scrollBy(1)}
                disabled={atEnd}
                accessibilityLabel="Next recipes"
              >
                <ChevronRightIcon size={18} color={INK} strokeWidth={2} />
              </Pressable>
            </View>
          )}
          <ArrowLink label="See all recipes" onPress={() => router.navigate('/recipes')} />
        </View>
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={(e) => setOffset(e.nativeEvent.contentOffset.x)}
        onLayout={(e) => setViewportWidth(e.nativeEvent.layout.width)}
        contentContainerStyle={styles.carouselRow}
      >
        {meals.map((meal) => (
          <HomeRecipeCard key={meal.id} meal={meal} width={cardWidth} stacked={!isDesktop} />
        ))}
      </ScrollView>
    </>
  );
}

// Home's own promotional recipe card (Anabelle, 2026-10-23): horizontal,
// the 400px photo on the left; title, descriptor and the recipe's deal
// driver (its first deal-tagged ingredient, i.e. the main ingredient the
// recipe is built around) with that deal's savings badge on the right.
// Tapping opens the recipe.
function HomeRecipeCard({ meal, width, stacked }: { meal: Meal; width: number; stacked: boolean }) {
  const photo = getRecipeImage(meal.name, meal.imageUrl);
  const driver = meal.dealTags[0];
  return (
    <Pressable
      style={[styles.recipeCard, stacked && styles.recipeCardStacked, { width }]}
      onPress={() => router.push({ pathname: '/recipe', params: { id: meal.id } })}
      accessibilityRole="link"
      accessibilityLabel={meal.name}
    >
      {photo ? (
        <Image source={photo} style={[styles.recipeCardImage, stacked && styles.recipeCardImageStacked]} resizeMode="cover" />
      ) : (
        <View style={[styles.recipeCardImage, stacked && styles.recipeCardImageStacked]} />
      )}
      <View style={styles.recipeCardText}>
        <Text style={styles.recipeCardTitle} numberOfLines={2}>
          {meal.name}
        </Text>
        {!!meal.descriptor && (
          <Text style={styles.recipeCardDescriptor} numberOfLines={3}>
            {meal.descriptor}
          </Text>
        )}
        {/* Cost-per-serving blurb (Anabelle, 2026-10-23). */}
        <View style={styles.priceBlurb}>
          <Text style={styles.priceBlurbText}>${meal.price.toFixed(2)} per serving</Text>
        </View>
        {driver && (
          <View style={styles.driverRow}>
            {showsRealDiscount(driver.discountPct, driver.originalPriceSource) ? (
              <View style={[styles.badge, styles.badgeDiscount]}>
                <Text style={[styles.badgeText, styles.badgeDiscountText]}>{formatRealDiscountLabel(driver.discountPct)}</Text>
              </View>
            ) : isGreatReferenceValue(driver.discountPct, driver.originalPriceSource) ? (
              <View style={[styles.badge, styles.badgeGreat]}>
                <Text style={[styles.badgeText, styles.badgeGreatText]}>{formatGreatReferenceValueLabel(driver.discountPct)}</Text>
              </View>
            ) : null}
            <Text style={styles.driverName} numberOfLines={1}>
              {toTitleCase(driver.name)}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
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
  sectionHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  arrows: { flexDirection: 'row', gap: 8 },
  // Same white-fill / 1.5px ink circle as the app's other icon buttons.
  arrowButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowButtonDisabled: { opacity: 0.35 },
  carouselRow: { gap: CARD_GAP, alignItems: 'flex-start', paddingBottom: 4 },
  recipeCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 16,
    overflow: 'hidden',
  },
  // Same proportions as the Recipes tab's photos (1402 x 824).
  recipeCardStacked: { flexDirection: 'column' },
  recipeCardImage: { width: IMAGE_WIDTH, aspectRatio: 1402 / 824, backgroundColor: '#F5F0EA' },
  recipeCardImageStacked: { width: '100%' },
  // Orange pill, same accent as the app's primary buttons.
  priceBlurb: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFA955',
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  priceBlurbText: { fontSize: 14, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  recipeCardText: { flex: 1, padding: 20, justifyContent: 'center', gap: 8 },
  recipeCardTitle: { fontSize: 20, lineHeight: 26, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  recipeCardDescriptor: { fontSize: 16, lineHeight: 24, color: '#343837' },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  driverName: { flexShrink: 1, fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
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
