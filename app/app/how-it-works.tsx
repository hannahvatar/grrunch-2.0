import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { XMarkIcon } from 'react-native-heroicons/outline';

const INK = '#111';

// Its own screen (pushed from settings.tsx), not the shared settings-detail
// stub -- Anabelle's call, 2026-08-28: this is a genuinely important
// section (explaining the tag system every recipe/grocery-list price is
// built on), not a placeholder.
//
// Every row here is real, verified against the actual badge logic in
// lib/curatedDeals.ts and compute_deal_tag_pricing() -- not a guess at
// what the tags "probably" mean. Colors match the exact badge colors
// rendered elsewhere in the app (IngredientRow.tsx / MealCard.tsx /
// best-deals.tsx all share the same badge styling).
interface TagRow {
  tag: string;
  tagBg: string;
  tagColor: string;
  meaning: string;
  source: string;
  // true for the one row that isn't actually a badge in the app -- the
  // "$X avg." estimated price renders as plain muted text with no
  // colored pill at all (see lib/curatedDeals.ts), so this row shouldn't
  // show a chip either, or it'd misrepresent what a user actually sees.
  noChip?: boolean;
}

// Calories/protein/serving-size copy -- verified against the real
// calculation, not a guess: refresh_recipe_nutrition() (see
// supabase/migrations/20260817030000_nutrition_quantity_override.sql)
// and the recipe-design range in lib/mealScaling.ts:13 (~500 cal / ~20g
// protein, +/-30% -> ~350-650 cal, ~14-26g protein). Deliberately framed
// as Grrunch's own design standard, NOT a Canada Food Guide/DRI figure --
// verified there's no such government-recommendation calculation
// anywhere in the codebase (Anabelle, 2026-08-28).
const NUTRITION_PARAGRAPHS: string[] = [
  "Calorie and protein numbers come from real nutrition databases (Open Food Facts for packaged products, USDA FoodData Central for generic ingredients), reviewed by hand before we trust them.",
  "Every recipe is designed to land within a range per serving, roughly 300–600 calories and 15–25g of protein, rather than a single fixed target.",
  "These are estimates, not a lab measurement of your exact groceries. They're built from real food-database figures and standard kitchen averages, like an average egg or onion weight.",
];

const TAG_ROWS: TagRow[] = [
  {
    // Colors match IngredientRow.tsx's dealDiscountBadge/dealGreatValueBadge/
    // dealFairPriceBadge exactly -- the pill-shaped, light-bg/dark-text
    // variant shown on the Weekly Deals tab and Meals tab cards (the
    // surfaces most people actually see), not the small solid-rect variant
    // used in the non-stacked grocery-list layout.
    tag: 'Up to 20% off',
    tagBg: '#DFF5E3',
    tagColor: '#1B7A43',
    meaning: "This week's price is lower than the store's own listed regular price for this item.",
    source: "Scraped straight from this week's official flyer.",
  },
  {
    tag: '12% below',
    tagBg: '#EDE7FE',
    tagColor: '#6B46C1',
    meaning: "Not a flyer sale, but priced well below what this item typically costs.",
    source: 'Compared against StatCan and hand-researched reference prices. The store never claimed a sale.',
  },
  {
    tag: 'Fair price',
    tagBg: '#FFEAD4',
    tagColor: '#FF7A2A',
    meaning: "Close to typical pricing. Not a special deal, but not a bad one either.",
    source: "A mix, depending on the item: the store's own flyer price, StatCan data, or hand-researched reference pricing.",
  },
  {
    tag: '$4.50 avg.',
    tagBg: '#F2F2F2',
    tagColor: '#666',
    meaning: "An estimated everyday price for a staple that isn't tied to any flyer deal.",
    source: 'StatCan retail pricing data, or our own research for produce and pantry staples.',
    noChip: true,
  },
];

export default function HowItWorksScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>How it works</Text>
        <Pressable style={styles.closeButton} onPress={() => router.back()} hitSlop={8}>
          <XMarkIcon size={18} color={INK} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Every price you see on a recipe or your grocery list carries a tag that shows how it compares to
          typical pricing, and where the number comes from. Here's what each one means.
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeaderRow]}>
              <Text style={[styles.headerCell, styles.colTag]}>Tag</Text>
              <Text style={[styles.headerCell, styles.colText]}>What it means</Text>
              <Text style={[styles.headerCell, styles.colText]}>Where it's from</Text>
            </View>
            {TAG_ROWS.map((row) => (
              <View key={row.tag} style={styles.tableRow}>
                <View style={styles.colTag}>
                  {row.noChip ? (
                    <Text style={[styles.plainTagText, { color: row.tagColor }]}>{row.tag}</Text>
                  ) : (
                    <View style={[styles.tagChip, { backgroundColor: row.tagBg }]}>
                      <Text style={[styles.tagChipText, { color: row.tagColor }]}>{row.tag}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.cellText, styles.colText]}>{row.meaning}</Text>
                <Text style={[styles.cellText, styles.colText]}>{row.source}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
        <Text style={styles.swipeHint}>Swipe the table to see it all →</Text>

        <Text style={styles.footnote}>
          One item without a colored tag just means it's a plain ingredient with an estimated everyday price,
          not part of this week's deals at all.
        </Text>

        <Text style={styles.sectionHeading}>Calories, protein & serving size</Text>
        <View style={styles.nutritionCard}>
          {NUTRITION_PARAGRAPHS.map((paragraph, i) => (
            <Text key={i} style={styles.nutritionParagraph}>
              {paragraph}
            </Text>
          ))}
          {/* Real disclaimer, matches lib/termsOfUse.ts's own "Recipes"
              section ("Grrunch does not provide medical or nutritional
              advice"... "determining whether a recipe meets their dietary
              requirements") -- not new legal language, just surfaced here
              too since this is where people are actually looking at the
              numbers (Anabelle, 2026-08-28). */}
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>
              Grrunch does not provide medical or nutritional advice. Please consider whether a recipe and its
              serving size are appropriate for your individual needs. We do our best to provide accurate
              nutritional information, but estimates may vary and errors can occur.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // GRRUNCH DS peach background, matches settings.tsx/manage-account.tsx.
  container: { flex: 1, backgroundColor: '#FFEAD4' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 60,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  content: { paddingHorizontal: 24, paddingBottom: 40 },
  intro: { fontSize: 15, lineHeight: 22, color: INK, marginBottom: 20 },
  tableScroll: { marginHorizontal: -24 },
  table: {
    marginHorizontal: 24,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: INK,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: INK,
  },
  tableHeaderRow: { borderTopWidth: 0, backgroundColor: '#FFD8AC' },
  colTag: { width: 130, padding: 10, justifyContent: 'center', borderRightWidth: 1, borderRightColor: INK },
  colText: { width: 190, padding: 10, borderRightWidth: 1, borderRightColor: INK },
  headerCell: { fontSize: 12, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  cellText: { fontSize: 13, lineHeight: 18, color: INK },
  tagChip: { alignSelf: 'flex-start', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  tagChipText: { fontSize: 12, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  // Plain (no chip) rows aren't a badge in the real app -- shouldn't read
  // as bold/emphasized like an actual tag does.
  plainTagText: { fontSize: 13, fontWeight: '400', fontFamily: 'OpenSans_400Regular' },
  swipeHint: { fontSize: 12, color: INK, marginTop: 8, marginBottom: 20 },
  footnote: { fontSize: 13, lineHeight: 19, color: INK },
  sectionHeading: {
    fontSize: 20,
    fontWeight: '800',
    fontFamily: 'OpenSans_800ExtraBold',
    color: INK,
    marginTop: 32,
    marginBottom: 12,
  },
  // White card, matches the tag table above / get-support.tsx's FAQ
  // container -- same GRRUNCH DS "content lives in a white card" pattern.
  nutritionCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: INK,
    borderRadius: 12,
    padding: 16,
    gap: 14,
  },
  nutritionParagraph: { fontSize: 14, lineHeight: 20, color: INK },
  // GRRUNCH DS peach/orange treatment -- deliberately distinct from the
  // plain-text paragraphs above it, so the disclaimer still reads as its
  // own notice, in the app's own accent colors rather than a generic
  // amber warning.
  warningBanner: {
    backgroundColor: '#FFD8AC',
    borderWidth: 1.5,
    borderColor: '#FFA955',
    borderRadius: 10,
    padding: 12,
  },
  warningText: { fontSize: 13, lineHeight: 19, color: INK },
});
