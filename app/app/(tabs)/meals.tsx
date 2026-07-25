import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MEALS } from '../../lib/mealData';

// Guest-mode wireframe step 6 — Main App, Meals tab.
export default function MealsScreen() {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.guestBanner}>
          <Text style={styles.guestBannerText}>Browsing as guest</Text>
          <Text style={styles.signUpLink}>Sign up</Text>
        </View>

        <Text style={styles.title}>Your meal plan</Text>
        <Text style={styles.subtitle}>8 meals · based on this week's deals</Text>

        {MEALS.map((meal) => (
          <View key={meal.id} style={styles.mealCard}>
            <View style={styles.mealImagePlaceholder}>
              <Text style={styles.mealImageIcon}>🍴</Text>
            </View>
            <View style={styles.mealCardBody}>
              <View style={styles.mealHeaderRow}>
                <Text style={styles.mealName}>{meal.name}</Text>
                <View style={styles.priceBlock}>
                  <Text style={styles.mealPrice}>${meal.price.toFixed(2)}</Text>
                  <Text style={styles.perPortion}>/ portion</Text>
                </View>
              </View>
              <Text style={styles.mealTime}>🕐 {meal.minutes} min</Text>
              <View style={styles.tagPill}>
                <Text style={styles.tagText}>🏷️ {meal.tag}</Text>
              </View>
              <Pressable
                style={styles.recipeButton}
                onPress={() => router.push({ pathname: '/recipe', params: { id: meal.id } })}
              >
                <Text style={styles.recipeButtonText}>View recipe</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <View style={styles.totalCard}>
          <View>
            <Text style={styles.totalLabel}>Total · 8 meals</Text>
            <Text style={styles.totalSublabel}>avg. $3.56 / portion</Text>
          </View>
          <Text style={styles.totalValue}>$28.49</Text>
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Pressable style={styles.groceryButton} onPress={() => router.push('/grocery-list')}>
          <Text style={styles.groceryButtonText}>🧺  View grocery list</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60, gap: 16 },
  guestBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F2F2F2',
    borderRadius: 12,
    padding: 14,
  },
  guestBannerText: { color: '#666' },
  signUpLink: { fontWeight: '700', textDecorationLine: 'underline' },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 13, color: '#888', marginTop: -8 },
  mealCard: { borderWidth: 1, borderColor: '#eee', borderRadius: 14, overflow: 'hidden' },
  mealImagePlaceholder: {
    height: 100,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealImageIcon: { fontSize: 28, opacity: 0.4 },
  mealCardBody: { padding: 14, gap: 8 },
  mealHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  mealName: { fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8 },
  priceBlock: { alignItems: 'flex-end' },
  mealPrice: { fontSize: 17, fontWeight: '800' },
  perPortion: { fontSize: 11, color: '#999' },
  mealTime: { fontSize: 13, color: '#888' },
  tagPill: { backgroundColor: '#EEF4FF', borderRadius: 10, padding: 10 },
  tagText: { color: '#2C5FD6', fontSize: 13, fontWeight: '600' },
  recipeButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  recipeButtonText: { fontSize: 14, fontWeight: '700' },
  totalCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 14,
    padding: 16,
  },
  totalLabel: { fontSize: 16, fontWeight: '700' },
  totalSublabel: { fontSize: 13, color: '#888' },
  totalValue: { fontSize: 24, fontWeight: '800' },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: '#eee' },
  groceryButton: {
    backgroundColor: '#111',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  groceryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
