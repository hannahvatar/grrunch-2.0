import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { usePersonalTargets } from '../../lib/personalTargets';
import { usePlanTargets } from '../../lib/planTargets';

// GRRUNCH DS -- matches login.tsx/index.tsx/location.tsx/stores.tsx's palette.
const ACCENT = '#FFA955';
const INK = '#111';

// Guest-mode wireframe step 5 — Plan your meals.
//
// No quantity picker: a recipe's ingredients (and its deal-tagged anchor
// package) are fixed for the whole batch, so there's nothing to derive a
// "meals from recipes" ratio from anymore. These targets instead choose
// how many equal servings each matching recipe's batch gets divided into
// (see lib/mealScaling.ts) -- the user checks off which recipes they want
// and adds them to their grocery list.
export default function PlanMealsScreen() {
  const { targets: personalTargets, loaded: personalTargetsLoaded } = usePersonalTargets();
  const { setTargets } = usePlanTargets();
  const [calories, setCalories] = useState(600);
  const [protein, setProtein] = useState(30);
  const [prefilled, setPrefilled] = useState(false);

  // Pre-fill from the user's saved default (Profile > Personal targets)
  // once it's actually loaded from storage, rather than always starting at
  // a hardcoded 600/30. Only runs once -- freely adjusting these sliders
  // for a single plan shouldn't keep getting reset back to the default.
  useEffect(() => {
    if (personalTargetsLoaded && !prefilled) {
      setCalories(personalTargets.calories);
      setProtein(personalTargets.protein);
      setPrefilled(true);
    }
  }, [personalTargetsLoaded, personalTargets, prefilled]);

  return (
    <LinearGradient colors={['#fff', '#FFEAD4']} style={styles.gradient}>
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Choose your meal size</Text>

          <View style={styles.sliderBlock}>
            <View style={styles.sliderHeaderRow}>
              <Text style={styles.label}>Calories per meal</Text>
              <Text style={styles.sliderValue}>{calories} kcal</Text>
            </View>
            <Slider
              minimumValue={200}
              maximumValue={1000}
              step={10}
              value={calories}
              onValueChange={setCalories}
              minimumTrackTintColor="#FF942A"
              maximumTrackTintColor={INK}
              thumbTintColor="#FF942A"
            />
            <View style={styles.sliderBoundsRow}>
              <Text style={styles.sliderBoundText}>200 kcal</Text>
              <Text style={styles.sliderBoundText}>1000 kcal</Text>
            </View>
            <View style={styles.hintBox}>
              <Text style={styles.hint}>Average recommended: man 700 kcal · woman 550 kcal · child 400 kcal</Text>
            </View>
          </View>

          <View style={styles.sliderBlock}>
            <View style={styles.sliderHeaderRow}>
              <Text style={styles.label}>Protein per meal</Text>
              <Text style={styles.sliderValue}>{protein} g</Text>
            </View>
            <Slider
              minimumValue={10}
              maximumValue={60}
              step={1}
              value={protein}
              onValueChange={setProtein}
              minimumTrackTintColor="#FF942A"
              maximumTrackTintColor={INK}
              thumbTintColor="#FF942A"
            />
            <View style={styles.sliderBoundsRow}>
              <Text style={styles.sliderBoundText}>10 g</Text>
              <Text style={styles.sliderBoundText}>60 g</Text>
            </View>
            <View style={styles.hintBox}>
              <Text style={styles.hint}>Daily recommendation: man 56 g · woman 46 g · child 19–34 g</Text>
            </View>
          </View>

          <Text style={styles.footnote}>You can refine these targets anytime in your profile.</Text>
        </ScrollView>
        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
            onPress={() => {
              setTargets({ maxCalories: calories, minProtein: protein });
              router.replace('/(tabs)/meals');
            }}
          >
            <Text style={styles.primaryButtonText}>Get my meals</Text>
          </Pressable>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { padding: 24, paddingTop: 64, gap: 8 },
  title: { fontSize: 26, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', marginBottom: 8 },
  label: { fontSize: 16, fontWeight: '400', fontFamily: 'OpenSans_400Regular', color: INK, marginTop: 12 },
  sliderBlock: { marginTop: 12 },
  sliderHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sliderValue: { fontSize: 20, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  sliderBoundsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderBoundText: { fontSize: 12, fontWeight: '400', color: INK },
  hintBox: { backgroundColor: '#fff', borderRadius: 999, padding: 8, marginTop: 12 },
  hint: { fontSize: 12, color: '#767676' },
  footnote: { fontSize: 16, color: INK, marginTop: 16 },
  footer: { padding: 24 },
  primaryButton: {
    width: '100%',
    height: 56,
    justifyContent: 'center',
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 28,
    alignItems: 'center',
  },
  primaryButtonPressed: { borderColor: INK },
  primaryButtonText: { color: INK, fontSize: 17, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
});
