import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { CakeIcon, CheckIcon, HeartIcon } from 'react-native-heroicons/outline';
import { HeartIcon as HeartIconSolid } from 'react-native-heroicons/solid';

import {
  formatGreatReferenceValueLabel,
  isGreatReferenceValue,
  showsRealDiscount,
  toTitleCase,
} from '../lib/curatedDeals';
import type { Meal } from '../lib/mealData';
import { AvocadoBeanIcon, RestaurantIcon } from './MaterialSymbols';
import { getRecipeImage } from '../lib/recipeImages';

const ACCENT = '#FFA955';
const INK = '#111';

interface MealCardProps {
  meal: Meal;
  isSelected: boolean;
  isSaved: boolean;
  onToggleSelected: () => void;
  onToggleSaved: () => void;
}

// One recipe card as shown on the Meals tab -- shared with app/dev-
// recipes.tsx (a __DEV__-only, no-login recipe review screen) so a
// recipe looks identical in both places and never drifts between them.
export function MealCard({ meal, isSelected, isSaved, onToggleSelected, onToggleSaved }: MealCardProps) {
  return (
    <View style={styles.mealCardOuter}>
      <View pointerEvents="none" style={styles.mealCardShadow} />
      <View style={styles.mealCard}>
        <View style={[styles.mealImagePlaceholder, getRecipeImage(meal.name) && styles.mealImagePlaceholderPhoto]}>
          {getRecipeImage(meal.name) ? (
            <Image source={getRecipeImage(meal.name)} style={styles.mealImage} resizeMode="cover" />
          ) : (
            <CakeIcon size={28} color="#ccc" />
          )}
          {isSelected && (
            <View style={styles.groceryConfirmBadge}>
              <CheckIcon size={12} color="#fff" />
              <Text style={styles.groceryConfirmBadgeText}>Added</Text>
            </View>
          )}
          <Pressable style={styles.saveButton} onPress={onToggleSaved} hitSlop={8}>
            {isSaved ? (
              <HeartIconSolid size={20} color="#e0245e" />
            ) : (
              <HeartIcon size={20} color="#111" strokeWidth={2} />
            )}
          </Pressable>
        </View>
        <View style={styles.mealCardBody}>
          <View style={styles.mealHeaderRow}>
            <Text style={styles.mealName}>{meal.name}</Text>
          </View>
          <View style={styles.priceNutritionRow}>
            <View style={styles.priceBlock}>
              <Text style={styles.mealPrice}>${meal.price.toFixed(2)}</Text>
              <Text style={styles.perServing}>/ serving</Text>
              {/* The recipe's own natural yield -- the smallest batch it can
                  be made in, since the recipe page's stepper only ever
                  scales UP from here in whole multiples (servingsOptions),
                  never down. */}
              <Text style={styles.minServings}>• min. servings {meal.servings}</Text>
            </View>
            <View style={styles.nutritionRow}>
              <View style={styles.nutritionItem}>
                <RestaurantIcon size={16} color="#888" />
                <Text style={styles.nutritionText}>{meal.calories} cal</Text>
              </View>
              <View style={styles.nutritionItem}>
                <AvocadoBeanIcon size={16} color="#888" />
                <Text style={styles.nutritionText}>{meal.protein}g protein</Text>
              </View>
            </View>
          </View>
          {meal.dealTags.length > 0 && (
            <View style={styles.dealTagsRow}>
              {meal.dealTags.map((dealTag) => (
                <View key={dealTag.name} style={styles.dealTagRow}>
                  {showsRealDiscount(dealTag.discountPct, dealTag.originalPriceSource) ? (
                    <View style={styles.dealTagBadge}>
                      <Text style={styles.dealTagBadgeText}>{dealTag.discountPct}% off</Text>
                    </View>
                  ) : isGreatReferenceValue(dealTag.discountPct, dealTag.originalPriceSource) ? (
                    <View style={styles.greatValueBadge}>
                      <Text style={styles.greatValueBadgeText}>{formatGreatReferenceValueLabel(dealTag.discountPct)}</Text>
                    </View>
                  ) : (
                    <View style={styles.fairPriceBadge}>
                      <Text style={styles.fairPriceBadgeText}>Fair price</Text>
                    </View>
                  )}
                  <Text style={styles.dealTagName} numberOfLines={1}>
                    {toTitleCase(dealTag.name)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.buttonsRow}>
            <Pressable
              style={[styles.groceryToggleButton, isSelected && styles.groceryToggleButtonActive]}
              onPress={onToggleSelected}
            >
              <Text style={[styles.groceryToggleButtonText, isSelected && styles.groceryToggleButtonTextActive]}>
                {isSelected ? 'Remove from list' : 'Add to list'}
              </Text>
            </Pressable>

            <Pressable
              style={styles.recipeButton}
              onPress={() => router.push({ pathname: '/recipe', params: { id: meal.id } })}
            >
              <Text style={styles.recipeButtonText}>View recipe</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mealCardOuter: { position: 'relative' },
  // Same flat offset-shadow technique as the legal modal's card.
  mealCardShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    borderRadius: 24,
    transform: [{ translateX: -1 }, { translateY: 1 }],
  },
  mealCard: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 24,
    overflow: 'hidden',
  },
  // Doubled from 180 (Anabelle's call -- recipes are the star, and this
  // app only ever surfaces ~a dozen a week, so there's room to give
  // each one a bigger photo).
  mealImagePlaceholder: {
    height: 360,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Half the old ratio (1402/412 -> 1402/824), doubling the rendered
  // height at the same card width -- matches mealImagePlaceholder's own
  // doubled height above so a photo and the icon placeholder occupy the
  // same space. Existing pre-cropped photos (see lib/recipeImages.ts)
  // were framed for the OLD wide-banner ratio, so `cover` now crops
  // them tighter/more zoomed-in than before, not stretched -- worth a
  // fresh, taller re-crop from source next time one's touched, rather
  // than relying on auto-crop.
  mealImagePlaceholderPhoto: { height: 'auto', aspectRatio: 1402 / 824 },
  mealImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  saveButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffffcc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groceryConfirmBadge: {
    position: 'absolute',
    top: 14,
    right: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1E9E5A',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  groceryConfirmBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  mealCardBody: { padding: 14, gap: 10 },
  mealHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  mealName: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', flex: 1, marginRight: 8 },
  priceNutritionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 12,
  },
  // flexWrap: wrap -- was a plain nowrap row, which never actually wraps
  // to a second line no matter how narrow the card is; on a real device
  // (different font metrics than the web preview this was eyeballed
  // against) that meant "$X.XX / serving • min. servings N" could
  // overflow past the card's own width and get silently clipped by
  // mealCard's overflow: hidden instead of wrapping -- exactly the
  // "gets cutoff" Anabelle reported. rowGap covers the vertical gap
  // between lines once it does wrap (gap alone only covers horizontal
  // spacing within a line).
  priceBlock: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 6, rowGap: 2 },
  nutritionRow: { flexDirection: 'row', gap: 16 },
  nutritionItem: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  nutritionText: { fontSize: 13, color: '#888' },
  mealPrice: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  // Black, matching recipe.tsx's own perServing convention -- it sits
  // directly beside the bold price, not a secondary/muted stat.
  perServing: { fontSize: 13, color: INK },
  minServings: { fontSize: 13, color: '#888' },
  dealTagsRow: { gap: 6 },
  dealTagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dealTagName: { color: '#888', fontSize: 13, flex: 1 },
  dealTagBadge: { backgroundColor: '#96E696', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  dealTagBadgeText: { color: INK, fontSize: 12, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  // Light peach + saturated orange text -- distinct from
  // dealTagBadge's green (reserved for a real store discount; Fair
  // price sharing that color was a pre-existing inconsistency with
  // every other screen's badge, now unified as this instead). Needs
  // its own text style (not dealTagBadgeText's black) to pair with
  // the orange, matching dealFairPriceBadge's light-bg-dark-text
  // convention on the equivalent pill badge in IngredientRow.tsx.
  fairPriceBadge: { backgroundColor: '#FFEAD4', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  fairPriceBadgeText: { color: '#FF7A2A', fontSize: 12, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  // Purple -- distinct from dealTagBadge/fairPriceBadge's green here,
  // so a genuinely-good reference-compared price never reads as either
  // a real store discount or a merely-neutral price.
  greatValueBadge: { backgroundColor: '#EDE7FE', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  greatValueBadgeText: { color: '#6B46C1', fontSize: 12, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  buttonsRow: { flexDirection: 'row', gap: 10 },
  groceryToggleButton: {
    flex: 1,
    height: 56,
    justifyContent: 'center',
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 999,
    alignItems: 'center',
  },
  groceryToggleButtonActive: { backgroundColor: INK },
  groceryToggleButtonText: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  groceryToggleButtonTextActive: { color: '#fff' },
  recipeButton: {
    flex: 1,
    height: 56,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 999,
    alignItems: 'center',
  },
  recipeButtonText: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
});
