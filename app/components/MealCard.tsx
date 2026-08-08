import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { CakeIcon, CheckIcon, HeartIcon } from 'react-native-heroicons/outline';
import { HeartIcon as HeartIconSolid } from 'react-native-heroicons/solid';

import { MIN_DISPLAYED_DISCOUNT_PCT } from '../lib/curatedDeals';
import type { Meal } from '../lib/mealData';
import { AvocadoBeanIcon, RestaurantIcon } from './MaterialSymbols';
import { getRecipeImage } from '../lib/recipeImages';

const ACCENT = '#FFA955';
const INK = '#111';

// Flyer-sourced deal names come through however the store printed them
// (often ALL CAPS, e.g. "NO NAME® NATURALLY IMPERFECT™ SWEET PEPPERS") --
// title-cased for display only, so matching against the raw name elsewhere
// (grocery list, deal attribution) is unaffected.
function toTitleCase(text: string): string {
  return text.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

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
                  {dealTag.discountPct >= MIN_DISPLAYED_DISCOUNT_PCT ? (
                    <View style={styles.dealTagBadge}>
                      <Text style={styles.dealTagBadgeText}>{dealTag.discountPct}% off</Text>
                    </View>
                  ) : (
                    <View style={styles.fairPriceBadge}>
                      <Text style={styles.dealTagBadgeText}>Fair price</Text>
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
  mealImagePlaceholder: {
    height: 180,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Matches the pre-cropped card photo's own aspect ratio (see
  // lib/recipeImages.ts) so the full width of that crop shows with no
  // further side-cropping, instead of the fixed height above forcing a
  // narrower "cover" crop.
  mealImagePlaceholderPhoto: { height: 'auto', aspectRatio: 1402 / 412 },
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
  priceBlock: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  nutritionRow: { flexDirection: 'row', gap: 16 },
  nutritionItem: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  nutritionText: { fontSize: 13, color: '#888' },
  mealPrice: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  perServing: { fontSize: 13, color: '#888' },
  dealTagsRow: { gap: 6 },
  dealTagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dealTagName: { color: '#888', fontSize: 13, flex: 1 },
  dealTagBadge: { backgroundColor: '#96E696', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  dealTagBadgeText: { color: INK, fontSize: 12, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  fairPriceBadge: { backgroundColor: '#96E696', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
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
