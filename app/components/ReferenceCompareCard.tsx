import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { InputField } from './InputField';
import {
  COMPARE_UNIT_OPTIONS,
  benchmarkCostForQuantity,
  compare,
  formatMoney,
  formatPctVsBenchmark,
  formatVerdictSentence,
  splitReferenceUnit,
  type ComparisonOutcome,
} from '../lib/referenceCompare';
import {
  fetchProducePrices,
  fetchStaplePrices,
  fetchStatcanPrices,
  rankReferenceCandidates,
  type ReferenceCandidate,
  type ReferenceTier,
} from '../lib/staplePrices';

const INK = '#111';
const MUTED = '#767676';
const GOOD = '#1B7F3B';
const BAD = '#D0342C';
const NEUTRAL_BORDER = '#C7C7C7';

// grocerytracker.ca is named explicitly (Anabelle: "grocerytracker is
// also a good source") because it's already how the produce tier gets
// filled -- scripts/sync_weekly_deals.py flags produce deals with no
// reference match into an Airtable gap list for a human to look up
// there. So a produce-tier row IS, in practice, often a grocerytracker
// number, and the manual-entry option below is for when she's looking
// at one that hasn't made it into the table yet.
const TIER_LABELS: Record<ReferenceTier, string> = {
  statcan: 'StatCan',
  produce: 'Produce (human-checked, e.g. grocerytracker)',
  staple: 'Staple (human-verified)',
};

type ConfirmedReference =
  | { kind: 'table'; candidate: ReferenceCandidate }
  | { kind: 'manual'; name: string; avgPrice: number; unit: string };

interface ReferenceCompareCardProps {
  itemName: string;
  initialPrice?: string;
  initialQuantity?: string;
  initialUnit?: string;
  // When set, the card offers to hand the computed reference cost back
  // to the caller -- dev-deals fills it into the deal's Original price
  // field, which is exactly what original_price_source='reference'
  // means ("we calculated it"). Omitted on the standalone screen, where
  // there's nothing to write to.
  onUseAsOriginalPrice?: (value: number) => void;
}

// Shared reference-vs-flyer price comparison. Mounted in two places, on
// purpose: inside dev-deals' review card (where the approve/reject
// decision actually happens, prefilled from the deal being reviewed)
// and on the standalone dev-cost screen (for an item that isn't in the
// review queue at all). One engine, two doors -- the comparison math
// lives in lib/referenceCompare.ts and is never reimplemented per
// screen.
export function ReferenceCompareCard({
  itemName,
  initialPrice,
  initialQuantity,
  initialUnit,
  onUseAsOriginalPrice,
}: ReferenceCompareCardProps) {
  const [statcan, setStatcan] = useState<Awaited<ReturnType<typeof fetchStatcanPrices>>>([]);
  const [produce, setProduce] = useState<Awaited<ReturnType<typeof fetchProducePrices>>>([]);
  const [staple, setStaple] = useState<Awaited<ReturnType<typeof fetchStaplePrices>>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [confirmed, setConfirmed] = useState<ConfirmedReference | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPrice, setManualPrice] = useState('');
  const [manualUnit, setManualUnit] = useState('');

  const [price, setPrice] = useState(initialPrice ?? '');
  const [quantity, setQuantity] = useState(initialQuantity ?? '');
  const [unit, setUnit] = useState(initialUnit ?? '');

  useEffect(() => {
    Promise.all([fetchStatcanPrices(), fetchProducePrices(), fetchStaplePrices()])
      .then(([statcanPrices, producePrices, staplePrices]) => {
        setStatcan(statcanPrices);
        setProduce(producePrices);
        setStaple(staplePrices);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  // A new item means a completely different set of candidates, so an
  // earlier confirmation can't carry over -- it would silently price
  // one item against another item's reference.
  useEffect(() => {
    setConfirmed(null);
    setManualOpen(false);
  }, [itemName]);

  const candidates = useMemo(
    () => (itemName.trim() ? rankReferenceCandidates(itemName, statcan, produce, staple) : []),
    [itemName, statcan, produce, staple]
  );

  const reference =
    confirmed?.kind === 'table'
      ? confirmed.candidate
      : confirmed?.kind === 'manual'
        ? { name: confirmed.name, avgPrice: confirmed.avgPrice, unit: confirmed.unit }
        : null;

  // Same engine dev-cost.tsx runs -- a reference row's free-text
  // denomination ("750 grams", "per kilogram") is split into the
  // price/per/unit triple compare() takes, so both screens normalize to
  // the same per-100g / per-100ml / per-unit basis and can't disagree
  // about whether something is a good price.
  const outcome: ComparisonOutcome | null =
    reference && price.trim() && quantity.trim()
      ? compare(parseFloat(price), quantity, unit, {
          kind: 'reference',
          price: reference.avgPrice,
          ...splitReferenceUnit(reference.unit),
        })
      : null;
  const fillValue =
    outcome?.ok ? benchmarkCostForQuantity(outcome.comparison, quantity, unit) : undefined;

  function confirmManual() {
    const parsed = parseFloat(manualPrice);
    if (!Number.isFinite(parsed) || parsed <= 0 || !manualUnit.trim()) return;
    setConfirmed({ kind: 'manual', name: 'Entered by hand', avgPrice: parsed, unit: manualUnit.trim() });
  }

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={INK} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.card}>
        <Text style={styles.note}>Couldn't load the reference tables. Check the dev server/console.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>1 · Confirm the reference price</Text>

      {!itemName.trim() && <Text style={styles.note}>Enter an item name to look up references.</Text>}

      {itemName.trim() && candidates.length === 0 && (
        <Text style={styles.note}>
          No reference matches "{itemName}" -- normal for branded/packaged goods, which these tables don't
          cover. Enter a price by hand below, or leave the original price unknown (no badge).
        </Text>
      )}

      {candidates.map((candidate) => (
        <CandidateRow
          key={`${candidate.source}-${candidate.name}`}
          candidate={candidate}
          selected={confirmed?.kind === 'table' && confirmed.candidate === candidate}
          onPress={() => setConfirmed({ kind: 'table', candidate })}
        />
      ))}

      {!manualOpen && (
        <Pressable onPress={() => setManualOpen(true)} hitSlop={8}>
          <Text style={styles.link}>None of these — enter a reference by hand</Text>
        </Pressable>
      )}
      {manualOpen && (
        <View style={styles.manualBox}>
          <Text style={styles.fieldLabel}>Reference price</Text>
          <InputField value={manualPrice} onChangeText={setManualPrice} keyboardType="decimal-pad" placeholder="0.00" />
          <Text style={styles.fieldLabel}>Per (e.g. "kg", "100 g", "750 grams", "each")</Text>
          <InputField value={manualUnit} onChangeText={setManualUnit} placeholder="kg" autoCapitalize="none" />
          <Pressable style={styles.smallButton} onPress={confirmManual}>
            <Text style={styles.smallButtonText}>Use this reference</Text>
          </Pressable>
          <Text style={styles.note}>
            Used for this comparison only -- nothing is written to the reference tables. A number worth keeping
            still goes through the Produce Reference Gaps Airtable, same as always.
          </Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>2 · The item you're investigating</Text>
      <Text style={styles.fieldLabel}>Displayed price</Text>
      <InputField value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="0.00" />
      <Text style={styles.fieldLabel}>For this quantity</Text>
      <InputField value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="750" />
      <Text style={styles.fieldLabel}>Unit</Text>
      <View style={styles.unitRow}>
        {COMPARE_UNIT_OPTIONS.map((option) => (
          <Pressable
            key={option}
            style={[styles.unitChip, unit.trim().toLowerCase() === option.toLowerCase() && styles.unitChipSelected]}
            onPress={() => setUnit(option)}
          >
            <Text
              style={[
                styles.unitChipText,
                unit.trim().toLowerCase() === option.toLowerCase() && styles.unitChipTextSelected,
              ]}
            >
              {option}
            </Text>
          </Pressable>
        ))}
      </View>
      <InputField value={unit} onChangeText={setUnit} placeholder="or type any unit" autoCapitalize="none" />

      <Text style={styles.sectionTitle}>3 · Same quantity, same money</Text>
      {!reference && <Text style={styles.note}>Confirm a reference above to compare.</Text>}
      {reference && !outcome && <Text style={styles.note}>Enter the price and quantity to compare.</Text>}
      {outcome && !outcome.ok && <Text style={styles.blocked}>{outcome.reason}</Text>}
      {reference && outcome?.ok && (
        <View style={[styles.resultCard, outcome.comparison.verdict === 'HIGHER' && styles.resultCardBad]}>
          <Text
            style={[
              styles.verdict,
              outcome.comparison.verdict === 'LOWER' && styles.verdictGood,
              outcome.comparison.verdict === 'HIGHER' && styles.verdictBad,
            ]}
          >
            {outcome.comparison.verdict} — {formatVerdictSentence(outcome.comparison)}
          </Text>

          <View style={styles.compareRow}>
            <Text style={styles.compareLabel}>This item</Text>
            <Text style={styles.compareValue}>
              {formatMoney(outcome.comparison.itemPerBasis)}/{outcome.comparison.basisLabel} · {formatMoney(parseFloat(price))} for {quantity} {unit}
            </Text>
          </View>
          <View style={styles.compareRow}>
            <Text style={styles.compareLabel}>Benchmark</Text>
            <Text style={styles.compareValue}>
              {formatMoney(outcome.comparison.benchmarkPerBasis)}/{outcome.comparison.basisLabel} ·{' '}
              {formatPctVsBenchmark(outcome.comparison)}
            </Text>
          </View>
          <Text style={styles.note}>
            Reference: {reference.name} — ${reference.avgPrice.toFixed(2)} / {reference.unit}
          </Text>

          {onUseAsOriginalPrice && fillValue !== undefined && (
            <Pressable style={styles.smallButton} onPress={() => onUseAsOriginalPrice(fillValue)}>
              <Text style={styles.smallButtonText}>
                Use {formatMoney(fillValue)} as the original price
              </Text>
            </Pressable>
          )}
          {onUseAsOriginalPrice && fillValue !== undefined && (
            <Text style={styles.note}>
              That's what {quantity} {unit} costs at the reference's own rate. Fills the field only -- nothing is
              saved until you hit Save, and the app never shows a reference-sourced original price as a
              struck-through "was $X".
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function CandidateRow({
  candidate,
  selected,
  onPress,
}: {
  candidate: ReferenceCandidate;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.candidate, selected && styles.candidateSelected]} onPress={onPress}>
      <View style={styles.candidateHeader}>
        <Text style={styles.candidateName}>{candidate.name}</Text>
        {candidate.isEnginePick && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>App uses this</Text>
          </View>
        )}
      </View>
      <Text style={styles.candidatePrice}>
        ${candidate.avgPrice.toFixed(2)} / {candidate.unit}
      </Text>
      <Text style={styles.candidateMeta}>
        {TIER_LABELS[candidate.source]}
        {candidate.matchKind === 'variety' && ' · variety of what you typed'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  card: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: NEUTRAL_BORDER, borderRadius: 12, padding: 12 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'OpenSans_800ExtraBold',
    color: INK,
    marginTop: 12,
  },
  fieldLabel: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK, marginTop: 4 },
  note: { fontSize: 12, color: MUTED },
  blocked: { fontSize: 13, color: BAD, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  link: { fontSize: 13, color: INK, textDecorationLine: 'underline', marginTop: 4 },
  candidate: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: NEUTRAL_BORDER,
    borderRadius: 12,
    padding: 12,
    gap: 2,
  },
  candidateSelected: { borderColor: INK, borderWidth: 2.5 },
  candidateHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  candidateName: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  candidatePrice: { fontSize: 16, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  candidateMeta: { fontSize: 12, color: MUTED },
  badge: { backgroundColor: INK, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  manualBox: { gap: 6, borderWidth: 1.5, borderColor: NEUTRAL_BORDER, borderRadius: 12, padding: 12 },
  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  unitChip: { borderWidth: 1.5, borderColor: INK, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  unitChipSelected: { backgroundColor: INK },
  unitChipText: { fontSize: 12, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  unitChipTextSelected: { color: '#fff' },
  resultCard: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#96E696',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  resultCardBad: { borderColor: '#F2B8B5' },
  verdict: { fontSize: 15, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  verdictGood: { color: GOOD },
  verdictBad: { color: BAD },
  compareRow: { gap: 2 },
  compareLabel: { fontSize: 11, color: MUTED, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  compareValue: { fontSize: 13, color: INK },
  smallButton: {
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  smallButtonText: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
});
