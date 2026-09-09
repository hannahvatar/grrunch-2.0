import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StarIcon } from 'react-native-heroicons/outline';
import { StarIcon as StarIconSolid } from 'react-native-heroicons/solid';

const ACCENT = '#FFA955';
const INK = '#111';

const STARS = [1, 2, 3, 4, 5];

interface RecipeRatingProps {
  // Recipe-wide average -- null means nobody's rated it yet, distinct
  // from "rated it and it averaged low" (see Meal.avgRating's own
  // comment). Shown to everyone, any tier.
  avgRating: number | null;
  ratingCount: number;
  // This viewer's own rating, or null if they haven't rated (or can't --
  // callers pass null for a non-subscriber even if one exists from
  // before their subscription lapsed, so the display always matches
  // what canRate says). Filled instead of the average when present, so
  // a subscriber who's already voted sees their own vote, not the crowd's.
  myRating: number | null;
  // Whether tapping a star should actually submit a rating. false for a
  // guest or free account (Anabelle: "Unsubscribers can see the vote,
  // but can't vote") -- the stars still render (filled to the average),
  // they just route to the paywall instead of rating on tap, same
  // pattern as every other locked control in this app (MealCard's Add
  // to list/heart).
  canRate: boolean;
  onRate: (stars: number) => void;
}

// 5-star recipe rating (Anabelle, 2026-09-08). One row of tappable
// stars plus a plain-text summary -- no separate "your rating" vs.
// "average rating" widgets, since showing both at once for every recipe
// would be more than this page needs; myRating already taking over the
// display once a subscriber has voted is enough to tell the two apart.
export function RecipeRating({ avgRating, ratingCount, myRating, canRate, onRate }: RecipeRatingProps) {
  const displayValue = myRating ?? (avgRating ? Math.round(avgRating) : 0);

  function handlePress(star: number) {
    if (!canRate) {
      router.push({ pathname: '/upgrade', params: { reason: 'rate recipes' } });
      return;
    }
    onRate(star);
  }

  return (
    <View style={styles.row}>
      <View style={styles.stars}>
        {STARS.map((star) => (
          <Pressable key={star} onPress={() => handlePress(star)} hitSlop={4}>
            {star <= displayValue ? (
              <StarIconSolid size={20} color={ACCENT} />
            ) : (
              <StarIcon size={20} color={INK} strokeWidth={1.5} />
            )}
          </Pressable>
        ))}
      </View>
      <Text style={styles.summary}>
        {avgRating != null
          ? `${avgRating.toFixed(1)} (${ratingCount} rating${ratingCount === 1 ? '' : 's'})`
          : 'No ratings yet'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  stars: { flexDirection: 'row', gap: 3 },
  summary: { fontSize: 13, color: INK },
});
