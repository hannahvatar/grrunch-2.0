import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  MagnifyingGlassPlusIcon,
  TagIcon,
  UsersIcon,
} from 'react-native-heroicons/outline';

import { ArrowLink } from '../../components/ArrowLink';
import { ClosingSoonBanner } from '../../components/ClosingSoonBanner';
import { openInNewTab } from '../../components/IngredientRow';
import { ArrowOutwardIcon } from '../../components/MaterialSymbols';
import { CutoutViewer } from '../../components/CutoutViewer';
import { ProgressBar } from '../../components/ProgressBar';
import { UpgradeCta } from '../../components/UpgradeCta';
import { WeekGapState } from '../../components/WeekGapState';
import {
  bySavingsDesc,
  type Deal,
  fetchAllDeals,
  formatDealBadgePrice,
  formatGreatReferenceValueLabel,
  formatRealDiscountLabel,
  isGreatReferenceValue,
  priceUnitSuffix,
  showsRealDiscount,
  toTitleCase,
} from '../../lib/curatedDeals';
import { filterDealsByZone } from '../../lib/dealZones';
import { gridSpan, useIsDesktop } from '../../lib/layout';
import { useLiveWeek, useWeekDaysLeft, useWeekValidityLabel } from '../../lib/liveWeek';
import type { Meal } from '../../lib/mealData';
import { sortMealsByBestDeal } from '../../lib/mealScaling';
import { getRecipeImage } from '../../lib/recipeImages';
import { fetchAllRecipes } from '../../lib/recipes';
import { useSelectedStores } from '../../lib/selectedStores';
import { applyStoreFilter, useStoreFilter } from '../../lib/storeFilter';
import { useSubscription } from '../../lib/subscription';

const INK = '#111';
// Recipe carousel (Anabelle, 2026-10-23): horizontal cards with a 400px
// photo on the left and the details on the right, following her card
// mockup. On desktop a card is nearly the full content width (the next
// one peeks in); on a phone it's narrower and stacks (photo on top).
const IMAGE_WIDTH = 400;
const CARD_MAX_WIDTH = 820;
const CARD_PEEK = 64;
const CARD_GAP = 16;
// Top deals grid (Anabelle, 2026-10-26): 3 tiles a row on desktop (4 was
// too tall and narrow), 2 on a phone. 12 for members (Anabelle, 2026-10-26:
// "i want to be able to showcase 12 deals"), which fills both evenly.
const DEALS_SHOWN = 12;
const DEAL_COLUMNS_DESKTOP = 3;
const DEAL_COLUMNS_PHONE = 2;
const DEAL_GAP = 16;
// Non-members see the first 3, then the subscribe card (Anabelle,
// 2026-10-26).
const FREE_DEALS_SHOWN = 3;

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
  const weekDaysLeft = useWeekDaysLeft();
  const weekClosed = liveWeek?.closed ?? false;

  const [allMeals, setAllMeals] = useState<Meal[]>([]);
  const [allDeals, setAllDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [dealsGridWidth, setDealsGridWidth] = useState(0);

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

  // Deals again whenever Home comes back into view, so picks changed in
  // dev-deals (or a deal approved meanwhile) show without a page reload
  // (Anabelle, 2026-10-26: "what shows up on my hp is not what i picked").
  useFocusEffect(
    useCallback(() => {
      fetchAllDeals()
        .then(setAllDeals)
        .catch(() => {});
    }, [])
  );

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
  // Anabelle's hand-picked deals first, in her order (dev-deals, Anabelle
  // 2026-10-26), then the biggest savings fill any empty slots. Not
  // limited per category (several picks can share one; each tile names
  // its category). Only the visitor's own stores. Non-members get the 3
  // she marked free (like the free recipes; Anabelle 2026-10-26), else
  // the first 3, followed by the subscribe card.
  const handPicked = shownDeals
    .filter((deal) => deal.homePick !== null)
    .sort((a, b) => (a.homePick ?? 0) - (b.homePick ?? 0));
  if (!isSubscribed) handPicked.sort((a, b) => Number(b.homeFree) - Number(a.homeFree));
  const topDeals = [
    ...handPicked,
    ...shownDeals.filter((deal) => deal.homePick === null).sort(bySavingsDesc),
  ].slice(0, isSubscribed ? DEALS_SHOWN : FREE_DEALS_SHOWN);
  const dealColumns = isDesktop ? DEAL_COLUMNS_DESKTOP : DEAL_COLUMNS_PHONE;
  // From the grid's own measured width, so tiles fit the phone column on
  // web as well as the full screen on iPhone.
  const dealTileWidth = Math.floor((dealsGridWidth - DEAL_GAP * (dealColumns - 1)) / dealColumns);

  return (
    <View style={styles.container}>
      <ClosingSoonBanner />
      <ScrollView contentContainerStyle={[styles.scrollContent, desktopContent]}>
        <View>
          <Text style={styles.title}>This week at Grrunch</Text>
          {weekValidity && <Text style={styles.weekValidity}>{weekValidity}</Text>}
          {/* The free trial's time-left bar under the dates, so it reads
              as a short window (Anabelle, 2026-10-26). */}
          {weekDaysLeft && (
            <View style={styles.weekCountdown}>
              <ProgressBar
                progress={weekDaysLeft.daysLeft / weekDaysLeft.totalDays}
                label={
                  weekDaysLeft.daysLeft <= 1 ? 'Last day!' : `${weekDaysLeft.daysLeft} days left`
                }
                tier={weekDaysLeft.daysLeft <= 1 ? 'error' : weekDaysLeft.daysLeft <= 3 ? 'warning' : 'success'}
                trackColor="#fff"
              />
            </View>
          )}
          <Text style={styles.tagline}>The best deals from this week's flyers, and the recipes we made from them.</Text>
        </View>

        <RecipeCarousel meals={meals} isDesktop={isDesktop} windowWidth={windowWidth} />

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Top deals</Text>
          <ArrowLink label="See all deals" onPress={() => router.navigate('/best-deals')} />
        </View>
        <View style={styles.dealsGrid} onLayout={(e) => setDealsGridWidth(e.nativeEvent.layout.width)}>
          {dealsGridWidth > 0 && topDeals.map((deal) => (
            <DealTile key={deal.id} deal={deal} width={dealTileWidth} />
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
  const cardWidth = isDesktop
    ? Math.min(CARD_MAX_WIDTH, gridSpan(windowWidth, 8) - CARD_PEEK)
    : Math.min(IMAGE_WIDTH, windowWidth - 72);
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
        {meals.map((meal, index) => (
          <HomeRecipeCard key={meal.id} meal={meal} width={cardWidth} stacked={!isDesktop} bestDeal={index === 0} />
        ))}
      </ScrollView>
    </>
  );
}

// Home's promotional recipe card, laid out after Anabelle's mockup
// (2026-10-23): photo on the left (with a "Best deal" badge on the
// carousel's first recipe, which is the best-deal sort's top pick); on the
// right the time and servings, the title, the recipe's star deals (picked in
// dev-recipes; else the two biggest savings) as chips, the stores those deals come from, then the price per serving
// (black, no total), and a View recipe button. Percent chips
// keep the standing "Up to" wording (best-case numbers).
function HomeRecipeCard({ meal, width, stacked, bestDeal }: { meal: Meal; width: number; stacked: boolean; bestDeal: boolean }) {
  const photo = getRecipeImage(meal.name, meal.imageUrl);
  // Anabelle's picked "star" deals (dev-recipes, recipes.star_deals) in
  // her order; otherwise the two biggest savings that earn a badge.
  const picked = meal.starDeals
    .map((name) => meal.dealTags.find((tag) => tag.name === name))
    .filter((tag): tag is (typeof meal.dealTags)[number] => !!tag);
  const topDeals =
    picked.length > 0
      ? picked
      : [...meal.dealTags]
          .filter(
            (tag) =>
              showsRealDiscount(tag.discountPct, tag.originalPriceSource) ||
              isGreatReferenceValue(tag.discountPct, tag.originalPriceSource)
          )
          .sort((a, b) => b.discountPct - a.discountPct)
          .slice(0, 2);
  const stores = Array.from(new Set(meal.dealTags.map((tag) => tag.store).filter(Boolean)));
  // "save $X" from the mockup is held back: deal tags only carry each
  // deal's full-package price/regular price, while the recipe's own price
  // counts just the share it uses (fragment_by_weight), so summing package
  // savings overstated it (e.g. "save $13.05" on an $11.32 recipe). Needs
  // each tag's used share from refresh_recipe_deal_tags() first.
  const openRecipe = () => router.push({ pathname: '/recipe', params: { id: meal.id } });

  return (
    <Pressable
      style={[styles.recipeCard, stacked && styles.recipeCardStacked, { width }]}
      onPress={openRecipe}
      accessibilityRole="link"
      accessibilityLabel={meal.name}
    >
      <View style={[styles.recipeCardImageWrap, stacked && styles.recipeCardImageWrapStacked]}>
        {photo && <Image source={photo} style={styles.recipeCardImage} resizeMode="cover" />}
        {bestDeal && (
          <View style={styles.bestDealBadge}>
            <TagIcon size={16} color="#fff" strokeWidth={2} />
            <Text style={styles.bestDealBadgeText}>Best deal</Text>
          </View>
        )}
      </View>

      <View style={[styles.recipeCardBody, stacked && styles.recipeCardBodyStacked]}>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <ClockIcon size={18} color="#555" />
            <Text style={styles.metaText}>{meal.minutes} min</Text>
          </View>
          <View style={styles.metaItem}>
            <UsersIcon size={18} color="#555" />
            <Text style={styles.metaText}>{meal.servings} servings</Text>
          </View>
        </View>

        <Text style={styles.recipeCardTitle} numberOfLines={2}>
          {meal.name}
        </Text>

        {topDeals.length > 0 && (
          <View style={styles.chipsRow}>
            {/* Same badge colors and wording as the rest of the app (Anabelle,
                2026-10-23): blue "Up to X% off" for a real store discount,
                purple "Up to X% below" against the reference price. */}
            {topDeals.map((tag) => {
              const real = showsRealDiscount(tag.discountPct, tag.originalPriceSource);
              // A picked star deal can be a plain fair price: no % pill then.
              const hasBadge = real || isGreatReferenceValue(tag.discountPct, tag.originalPriceSource);
              return (
                <View
                  key={tag.name}
                  style={[styles.dealChip, real ? styles.dealChipDiscount : styles.dealChipGreat, !hasBadge && styles.dealChipNoBadge]}
                >
                  {hasBadge && (
                    <View style={[styles.badge, styles.chipBadge]}>
                      <Text style={[styles.badgeText, real ? styles.badgeDiscountText : styles.badgeGreatText]}>
                        {real ? formatRealDiscountLabel(tag.discountPct) : formatGreatReferenceValueLabel(tag.discountPct)}
                      </Text>
                    </View>
                  )}
                  <Text
                    style={[styles.dealChipName, real ? styles.badgeDiscountText : styles.badgeGreatText]}
                    numberOfLines={1}
                  >
                    {toTitleCase(tag.name)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {stores.length > 0 && <Text style={styles.storesText}>Deals from {stores.join(', ')}</Text>}

        <View style={styles.cardFooter}>
          <View>
            <Text style={styles.servingPriceRow}>
              <Text style={styles.servingPrice}>${meal.price.toFixed(2)}</Text>
              <Text style={styles.servingUnit}> / serving</Text>
            </Text>
          </View>
          <Pressable style={styles.viewRecipeButton} onPress={openRecipe}>
            <Text style={styles.viewRecipeButtonText}>View recipe</Text>
            <ArrowRightIcon size={18} color="#fff" strokeWidth={2} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

// Deal tile for the Top deals grid: the flyer cutout on top (whole, not
// cropped) with the same savings badge Weekly Deals shows, then name,
// store and price. Tapping it opens Weekly Deals.
function DealTile({ deal, width }: { deal: Deal; width: number }) {
  const price = formatDealBadgePrice(deal.price, deal.priceUnit, deal.packageWeightG);
  const suffix = priceUnitSuffix(deal.priceUnit, deal.packageWeightG);
  const [zoomOpen, setZoomOpen] = useState(false);
  return (
    <View style={[styles.dealTile, { width }]}>
      <View style={styles.dealTileImageWrap}>
        {/* Click the cutout to preview it, same as everywhere else
            (Anabelle, 2026-10-26). */}
        {deal.imageUrl && (
          <Pressable
            style={styles.dealTileImage}
            onPress={() => setZoomOpen(true)}
            accessibilityRole="imagebutton"
            accessibilityLabel="Enlarge flyer cutout"
          >
            <Image source={{ uri: deal.imageUrl }} style={styles.dealTileImage} resizeMode="contain" />
            <View style={styles.zoomHint} pointerEvents="none">
              <MagnifyingGlassPlusIcon size={14} color="#fff" strokeWidth={2} />
            </View>
          </Pressable>
        )}
        {/* Category on every tile (Anabelle, 2026-10-26): picks can come
            from the same category, so each one says which. */}
        <View style={styles.categoryTag}>
          <Text style={styles.categoryTagText}>{deal.category}</Text>
        </View>
      </View>
      {deal.imageUrl && <CutoutViewer uri={deal.imageUrl} visible={zoomOpen} onClose={() => setZoomOpen(false)} />}
      <View style={styles.dealTileBody}>
        {showsRealDiscount(deal.discountPct, deal.originalPriceSource) ? (
          <View style={[styles.badge, styles.badgeDiscount]}>
            <Text style={[styles.badgeText, styles.badgeDiscountText]}>{formatRealDiscountLabel(deal.discountPct)}</Text>
          </View>
        ) : isGreatReferenceValue(deal.discountPct, deal.originalPriceSource) ? (
          <View style={[styles.badge, styles.badgeGreat]}>
            <Text style={[styles.badgeText, styles.badgeGreatText]}>{formatGreatReferenceValueLabel(deal.discountPct)}</Text>
          </View>
        ) : (
          // No saving to claim: "Fair price", same as Weekly Deals, so every
          // tile has a badge (Anabelle, 2026-10-26).
          <View style={[styles.badge, styles.badgeFair]}>
            <Text style={[styles.badgeText, styles.badgeFairText]}>Fair price</Text>
          </View>
        )}
        <Text style={styles.dealName} numberOfLines={2}>
          {toTitleCase(deal.itemName)}
        </Text>
        <Text style={styles.dealStore}>{deal.chainName}</Text>
        {/* Same "See in flyer" link as the deals on recipes and My list. */}
        <Pressable
          style={styles.flyerLinkRow}
          onPress={deal.productUrl ? () => openInNewTab(deal.productUrl) : undefined}
          disabled={!deal.productUrl}
          hitSlop={12}
        >
          <Text style={[styles.flyerLink, !deal.productUrl && styles.flyerLinkDisabled]}>See in flyer</Text>
          <ArrowOutwardIcon size={14} color={deal.productUrl ? INK : '#999'} />
        </Pressable>
        {/* Price, then a "View deal" button like the recipe card's "View
            recipe" (Anabelle, 2026-10-26); it opens Weekly Deals on this
            deal, its section open. */}
        <View style={styles.dealTileFooter}>
          <Text style={styles.dealPrice}>
            ${price.toFixed(2)}
            {suffix}
          </Text>
          <Pressable
            style={styles.viewDealButton}
            onPress={() => router.navigate({ pathname: '/best-deals', params: { deal: deal.id } })}
          >
            <Text style={styles.viewRecipeButtonText}>View deal</Text>
            <ArrowRightIcon size={18} color="#fff" strokeWidth={2} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFEAD4' },
  centered: { alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 140, gap: 16 },
  title: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  weekValidity: { fontSize: 14, color: '#343837', marginTop: 2 },
  // Bar kept short, like it is in the trial card.
  weekCountdown: { maxWidth: 320, marginTop: 8 },
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
  // Stretch: every card matches the tallest one (Anabelle, 2026-10-23);
  // the price row is pinned to the bottom (cardFooter marginTop: 'auto').
  carouselRow: { gap: CARD_GAP, alignItems: 'stretch', paddingBottom: 4 },
  recipeCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 16,
    overflow: 'hidden',
  },
  recipeCardStacked: { flexDirection: 'column' },
  recipeCardBodyStacked: { width: '100%' },
  // Photo column: half the card (Anabelle, 2026-10-23: 50% image / 50%
  // content), as tall as the card (cover-cropped).
  recipeCardImageWrap: { width: '50%', alignSelf: 'stretch', backgroundColor: '#F5E3CF' },
  recipeCardImageWrapStacked: { width: '100%', aspectRatio: 1402 / 824 },
  recipeCardImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  bestDealBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: INK,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  bestDealBadgeText: { color: '#fff', fontSize: 14, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  // Content never overflows the card (Anabelle, 2026-10-23): rows wrap
  // and shrink instead of pushing past the right edge on narrower cards.
  recipeCardBody: { width: '50%', minWidth: 0, padding: 20, gap: 12 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 14, color: '#555' },
  recipeCardTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  // Light pill around each badge + ingredient (Anabelle, 2026-10-23: keep
  // the mockup's chip background, with the app's badge colors inside).
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dealChip: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 4,
  },
  dealChipName: { fontSize: 14, color: INK, flexShrink: 1 },
  // Chip colors (Anabelle, 2026-10-23): tinted chip, white percentage pill,
  // and both texts in the badge's dark color. Purple for "Up to X% below"
  // (#EADAFF chip, #6B46C1 text); the same treatment in blue for a real
  // store discount ("Up to X% off": #DCE7FF chip, #2C5FD6 text).
  dealChipGreat: { backgroundColor: '#EADAFF' },
  dealChipDiscount: { backgroundColor: '#DCE7FF' },
  chipBadge: { backgroundColor: '#fff' },
  dealChipNoBadge: { paddingLeft: 12 },
  storesText: { fontSize: 14, color: '#555' },
  // Wraps: on a narrow card the button drops under the price.
  cardFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    columnGap: 16,
    rowGap: 12,
    marginTop: 'auto',
    paddingTop: 8,
  },
  servingPriceRow: {},
  servingPrice: { fontSize: 32, lineHeight: 36, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  servingUnit: { fontSize: 16, color: '#555' },
  viewRecipeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: INK,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  viewRecipeButtonText: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  sectionTitle: { fontSize: 20, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  dealsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: DEAL_GAP },
  // Same white card / 2px ink border as the recipe cards.
  dealTile: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 16,
    overflow: 'hidden',
  },
  dealTileImageWrap: { width: '100%', aspectRatio: 4 / 3, padding: 12, backgroundColor: '#fff' },
  dealTileImage: { width: '100%', height: '100%' },
  // Same magnifier hint as the cutouts on recipe and list rows.
  zoomHint: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    backgroundColor: 'rgba(17,17,17,0.7)',
    borderRadius: 999,
    padding: 5,
  },
  categoryTag: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  categoryTagText: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  // The badge sits first, above the name; flex-start keeps it hugging
  // its text instead of stretching across the tile.
  dealTileBody: { flex: 1, padding: 12, paddingTop: 0, gap: 4, alignItems: 'flex-start' },
  dealName: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  dealStore: { fontSize: 14, color: '#767676' },
  dealPrice: { fontSize: 18, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  flyerLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  flyerLink: {
    fontSize: 14,
    color: INK,
    fontWeight: '700',
    fontFamily: 'OpenSans_700Bold',
    textDecorationLine: 'underline',
  },
  flyerLinkDisabled: { color: '#999', textDecorationLine: 'none' },
  // Pinned to the bottom so every tile in a row lines up; wraps the
  // button under the price on narrow (phone) tiles.
  dealTileFooter: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 12,
    rowGap: 8,
    marginTop: 'auto',
    paddingTop: 8,
  },
  // marginLeft auto: right-aligned, also when it wraps under the price.
  viewDealButton: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: INK,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  // Same badge colors as Weekly Deals (blue = real store discount,
  // purple = great value against a reference price).
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  badgeDiscount: { backgroundColor: '#E3ECFD' },
  badgeDiscountText: { color: '#2C5FD6' },
  badgeGreat: { backgroundColor: '#EDE7FE' },
  badgeGreatText: { color: '#6B46C1' },
  // Weekly Deals' peach "Fair price" badge.
  badgeFair: { backgroundColor: '#FFEAD4' },
  badgeFairText: { color: '#FF7A2A' },
});
