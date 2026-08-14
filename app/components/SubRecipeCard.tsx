import type { LayoutChangeEvent } from 'react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDownIcon, ChevronUpIcon } from 'react-native-heroicons/outline';

import type { SubRecipe } from '../lib/mealData';

const INK = '#111';

interface SubRecipeCardProps {
  subRecipe: SubRecipe;
  expanded: boolean;
  onToggle: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
}

// The collapsible "Companion Recipe" card -- extracted out of
// app/recipe.tsx (where it was built for the "Basic Crispy Pork
// Belly" example) so the Profile tab's "Companion recipes" section
// (browsing the full shared sub_recipes list directly, not just via a
// jump-link from a matching ingredient) can reuse the exact same card
// instead of duplicating ~50 lines of JSX/styles. Each caller owns its
// own expanded/onToggle state independently -- see recipe.tsx
// (defaults open, since a jump-link lands you right on the one
// relevant sub-recipe) vs profile.tsx (defaults collapsed, since it's
// browsing a whole list at once).
export function SubRecipeCard({ subRecipe, expanded, onToggle, onLayout }: SubRecipeCardProps) {
  return (
    <View onLayout={onLayout}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{subRecipe.title}</Text>
            <Text style={styles.description}>{subRecipe.description}</Text>
          </View>
          <Pressable style={styles.toggleButton} onPress={onToggle} hitSlop={8}>
            {expanded ? <ChevronUpIcon size={14} color={INK} /> : <ChevronDownIcon size={14} color={INK} />}
          </Pressable>
        </View>
        {expanded && (
          <>
            <View style={styles.divider} />
            <Text style={styles.sectionLabel}>Ingredients</Text>
            <View style={styles.ingredientsList}>
              {subRecipe.ingredients.map((ingredientText, index) => (
                <Text key={index} style={styles.bullet}>
                  •  {ingredientText}
                </Text>
              ))}
            </View>
            <Text style={[styles.sectionLabel, styles.instructionsHeading]}>Instructions</Text>
            <View style={styles.instructionsList}>
              {subRecipe.instructions.map((step, index) => (
                <View key={index} style={styles.instructionRow}>
                  <Text style={styles.instructionNumber}>{index + 1}.</Text>
                  <Text style={styles.instructionText}>{step}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    borderStyle: 'dashed',
    borderRadius: 20,
    padding: 20,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerText: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  description: { fontSize: 14, lineHeight: 21, color: INK, marginTop: 6 },
  toggleButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { height: 1, backgroundColor: '#E8E8E8', marginVertical: 16 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'OpenSans_800ExtraBold',
    color: INK,
    letterSpacing: 1,
    marginBottom: 10,
  },
  ingredientsList: { gap: 10 },
  bullet: { fontSize: 15, color: '#333' },
  instructionsHeading: { marginTop: 16 },
  instructionsList: { gap: 12 },
  instructionRow: { flexDirection: 'row', gap: 10 },
  instructionNumber: { fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK, minWidth: 20 },
  instructionText: { flex: 1, fontSize: 15, lineHeight: 22, color: '#333' },
});
