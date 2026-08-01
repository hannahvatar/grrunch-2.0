import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

// Guest-mode wireframe step 5 — Plan your meals.
//
// No quantity picker: recipes have a real, fixed serving count (the actual
// yield of their ingredients as sold, not an arbitrary number), so there's
// nothing to derive a "meals from recipes" ratio from anymore. Meals just
// shows every recipe matching these nutrition targets; the user
// checks off which ones they want and adds them to their grocery list.
export default function PlanMealsScreen() {
  const [calories, setCalories] = useState(600);
  const [protein, setProtein] = useState(30);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Plan your meals</Text>

        <Text style={styles.categoryLabel}>Nutrition per meal</Text>

        <View style={styles.sliderBlock}>
          <View style={styles.sliderHeaderRow}>
            <Text style={styles.label}>CALORIES PER MEAL</Text>
            <Text style={styles.sliderValue}>{calories} kcal</Text>
          </View>
          <Slider
            minimumValue={200}
            maximumValue={1000}
            step={10}
            value={calories}
            onValueChange={setCalories}
            minimumTrackTintColor="#111"
            maximumTrackTintColor="#ddd"
          />
          <View style={styles.sliderBoundsRow}>
            <Text style={styles.sliderBoundText}>200 kcal</Text>
            <Text style={styles.sliderBoundText}>1000 kcal</Text>
          </View>
          <Text style={styles.hint}>Avg. recommended: man 700 kcal · woman 550 kcal · child 400 kcal</Text>
        </View>

        <View style={styles.sliderBlock}>
          <View style={styles.sliderHeaderRow}>
            <Text style={styles.label}>PROTEIN PER MEAL</Text>
            <Text style={styles.sliderValue}>{protein} g</Text>
          </View>
          <Slider
            minimumValue={10}
            maximumValue={80}
            step={1}
            value={protein}
            onValueChange={setProtein}
            minimumTrackTintColor="#111"
            maximumTrackTintColor="#ddd"
          />
          <View style={styles.sliderBoundsRow}>
            <Text style={styles.sliderBoundText}>10 g</Text>
            <Text style={styles.sliderBoundText}>80 g</Text>
          </View>
          <Text style={styles.hint}>Daily rec.: man 56 g · woman 46 g · child 19–34 g</Text>
        </View>

        <Text style={styles.footnote}>You can refine these targets anytime in your profile.</Text>
      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          style={styles.primaryButton}
          onPress={() =>
            router.replace({
              pathname: '/(tabs)/meals',
              params: {
                maxCalories: String(calories),
                minProtein: String(protein),
              },
            })
          }
        >
          <Text style={styles.primaryButtonText}>Get my meals</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 24, paddingTop: 64, gap: 8 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 8 },
  categoryLabel: { fontSize: 15, fontWeight: '800' },
  categorySpacer: { marginTop: 16 },
  label: { fontSize: 12, fontWeight: '700', color: '#888', letterSpacing: 0.5, marginTop: 12 },
  sliderBlock: { marginTop: 12 },
  sliderHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sliderValue: { fontSize: 20, fontWeight: '800' },
  sliderBoundsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderBoundText: { fontSize: 12, color: '#999' },
  hint: { fontSize: 13, color: '#666', marginTop: 4 },
  footnote: { fontSize: 13, color: '#999', marginTop: 16 },
  footer: { padding: 24, borderTopWidth: 1, borderTopColor: '#eee' },
  primaryButton: {
    backgroundColor: '#111',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
