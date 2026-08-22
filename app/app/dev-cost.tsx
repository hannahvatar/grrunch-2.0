import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { SegmentedControl } from '../components/SegmentedControl';
import { supabase } from '../lib/supabase';
import {
  COMPARE_UNIT_OPTIONS,
  benchmarkCostForQuantity,
  compare,
  formatMoney,
  formatPctVsBenchmark,
  formatVerdictSentence,
  splitReferenceUnit,
  type Benchmark,
  type CompareUnit,
} from '../lib/referenceCompare';
import {
  fetchProducePrices,
  fetchStaplePrices,
  fetchStatcanPrices,
  rankReferenceCandidates,
  type ReferenceTier,
} from '../lib/staplePrices';
import { sizeFromItemName, splitMultiItemName } from '../lib/dealNames';
import type { Tables } from '../types/database';

type CuratedDeal = Tables<'curated_deals'>;

const INK = '#111';
const MUTED = '#767676';
const RULE = '#C7C7C7';

// Two-column above this width, stacked below -- the wireframe's own
// "collapses to a single column under ~1000px".
const TWO_COLUMN_WIDTH = 1000;

const UNIT_OPTIONS = COMPARE_UNIT_OPTIONS.map((unit) => ({ value: unit, label: unit }));

// What a deal's stored price is a price FOR. A lb/kg/100g deal's price
// is a RATE, so the comparable quantity is one of that rate's own units
// and package weight is deliberately ignored -- pairing a per-lb price
// with a 700 g package weight compares a per-pound rate against a whole
// package and reads as a far better deal than it is. A package/each
// deal's price is the flat whole-package price, so its real weight (or
// volume) is the honest quantity.
function observedQuantity(
  deal: CuratedDeal,
  nameForSize: string
): { quantity: string; unit: CompareUnit; fromName?: boolean } {
  if (deal.price_unit === 'lb') return { quantity: '1', unit: 'lb' };
  if (deal.price_unit === 'kg') return { quantity: '1', unit: 'kg' };
  if (deal.price_unit === '100g') return { quantity: '100', unit: 'g' };
  if (deal.package_weight_g != null) return { quantity: String(deal.package_weight_g), unit: 'g' };
  if (deal.package_volume_ml != null) return { quantity: String(deal.package_volume_ml), unit: 'ml' };
  // Reads the size off the PRODUCT's name, which for a multi-item
  // cutout is one part ("CAPERS, 125 mL"), not the whole combined
  // label -- otherwise all three parts would inherit whichever size
  // happened to come last.
  const fromName = sizeFromItemName(nameForSize);
  if (fromName) return { ...fromName, fromName: true };
  return { quantity: '1', unit: 'ea' };
}

// Only a FLYER-sourced original price is a real "was" price. An
// original_price whose source is 'reference' is a comparison we
// computed ourselves (see lib/curatedDeals.ts isReferencePriced) --
// treating it as the store's own previous price would let our own
// estimate masquerade as the store's claim, which is the one thing the
// app's pricing honesty rules never allow.
function flyerWasPrice(deal: CuratedDeal): string {
  if (deal.original_price == null || deal.original_price_source !== 'flyer') return '';
  return String(deal.original_price);
}

// Internal-only food cost calculator, built to Anabelle's wireframe
// (Figma Make "Food calculator app prototype"): load a real flyer
// cutout, normalize its price and a benchmark to the same per-100g /
// per-100ml / per-unit basis, and stamp the verdict.
//
// The benchmark is the flyer's OWN previous price whenever it prints
// one, and only falls back to a StatCan/produce/staple reference when
// it doesn't -- the store's own claim always beats our comparison.
//
// __DEV__ is React Native's standard global, true only in a local dev
// build -- same gate as dev-recipes.tsx and dev-deals.tsx.
export default function DevCostScreen() {
  const { width } = useWindowDimensions();
  const twoColumn = width >= TWO_COLUMN_WIDTH;

  const [deals, setDeals] = useState<CuratedDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // How much of the pricing-review backlog is left. Deliberately the
  // SAME definition dev-deals' own header uses (pricing_reviewed_at is
  // null -- see its unreviewedCount), so the two screens never quote
  // different numbers for the same queue. Counted across the whole
  // table rather than the 40 rows loaded for the chips below, and it
  // does not tick down as you work here: this screen writes nothing, so
  // an item is only ever really reviewed by saving it in dev-deals.
  const [toReviewCount, setToReviewCount] = useState<number | null>(null);

  const [statcan, setStatcan] = useState<Awaited<ReturnType<typeof fetchStatcanPrices>>>([]);
  const [produce, setProduce] = useState<Awaited<ReturnType<typeof fetchProducePrices>>>([]);
  const [staple, setStaple] = useState<Awaited<ReturnType<typeof fetchStaplePrices>>>([]);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [item, setItem] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<CompareUnit>('g');
  const [wasPrice, setWasPrice] = useState('');
  // True when QTY was read out of the item's name because the deal row
  // had no stored package size -- surfaced under the field, never left
  // to look like a stored fact.
  const [quantityFromName, setQuantityFromName] = useState(false);

  const [referenceItem, setReferenceItem] = useState('');
  const [referencePrice, setReferencePrice] = useState('');
  const [referencePer, setReferencePer] = useState('');
  const [referenceUnit, setReferenceUnit] = useState<CompareUnit>('g');
  // Open while she's typing in STATCAN ITEM, closed once a row is
  // picked -- otherwise the chosen row would keep sitting under the
  // field as a "result" for its own name.
  const [referenceSearchOpen, setReferenceSearchOpen] = useState(false);
  // Tri-state, not a boolean. 'unmatched' means the suggested
  // reference is not a fair comparison for this item -- Anabelle:
  // "curry sauce was ref to hot sauce and I dont think its a valid
  // comparison but I still want to consider the item". It rejects the
  // MATCH, never the item and never the reference row: the typed
  // values stay on screen (so it's visible what was rejected and why),
  // the item stays fully reviewable, and nothing is deleted anywhere --
  // this screen writes nothing at all.
  const [referenceState, setReferenceState] = useState<'unconfirmed' | 'confirmed' | 'unmatched'>('unconfirmed');

  const [recipeChoice, setRecipeChoice] = useState<'add' | 'skip' | null>(null);
  const [outcome, setOutcome] = useState<'confirmed' | 'rejected' | null>(null);
  // The row Confirm/Reject will write to. Null when the fields were
  // typed by hand rather than loaded from a chip -- there's nothing to
  // save against in that case, so the buttons stay inert.
  const [loadedDeal, setLoadedDeal] = useState<CuratedDeal | null>(null);
  const [saving, setSaving] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Pulled out of the mount effect so a split can refresh the queue --
  // the new copies need to appear as their own chips immediately, and
  // they add to the backlog count.
  async function reloadDeals() {
    const [dealsResult, countResult] = await Promise.all([
      // Unreviewed first, so tapping through the chips left-to-right
      // actually works the backlog down rather than landing on items
      // that were already dealt with.
      supabase
        .from('curated_deals')
        .select('*')
        .order('pricing_reviewed_at', { ascending: true, nullsFirst: true })
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('curated_deals')
        .select('id', { count: 'exact', head: true })
        .is('pricing_reviewed_at', null),
    ]);
    setDeals((dealsResult.data ?? []) as CuratedDeal[]);
    setToReviewCount(countResult.count ?? null);
  }

  useEffect(() => {
    Promise.all([reloadDeals(), fetchStatcanPrices(), fetchProducePrices(), fetchStaplePrices()])
      .then(([, statcanPrices, producePrices, staplePrices]) => {
        setStatcan(statcanPrices);
        setProduce(producePrices);
        setStaple(staplePrices);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Editing ANY reference field drops the confirmation -- a sign-off
  // has to be on the numbers actually on screen, not on whatever they
  // were when the button was last pressed.
  // Editing ANY reference field drops both a confirmation AND an
  // unmatch -- either verdict was about the numbers that were on
  // screen at the time, and changing them makes it stale. Typing a
  // different reference over an unmatched one is how you re-match.
  function editReference(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setReferenceState('unconfirmed');
    };
  }

  // One entry per PRODUCT, not per row. A cutout naming several
  // products ("UNICO OLIVES 375 mL, CAPERS, 125 mL or HOT PEPPER
  // RINGS, 750 mL") shows up once per product -- Anabelle: "i should
  // see it 3 times".
  //
  // Those products can't share one row: each needs its own package size
  // and its own reference, and confirming would write one name over the
  // others. So each part is paired with its OWN row, matched by
  // position among the sibling copies made by duplicate-curated-deal.
  // Until enough copies exist, the extra parts are shown as pending a
  // split rather than pretending to be reviewable.
  const chipEntries = useMemo(() => {
    const byName = new Map<string, CuratedDeal[]>();
    for (const deal of deals) {
      const siblings = byName.get(deal.item_name);
      if (siblings) siblings.push(deal);
      else byName.set(deal.item_name, [deal]);
    }
    for (const siblings of byName.values()) {
      siblings.sort((a, b) => a.created_at.localeCompare(b.created_at));
    }

    const seen = new Set<string>();
    const entries: Array<{
      key: string;
      label: string;
      itemName: string;
      deal: CuratedDeal | null;
      parts: string[];
      needsSplit: boolean;
    }> = [];

    for (const deal of deals) {
      if (seen.has(deal.item_name)) continue;
      seen.add(deal.item_name);
      const siblings = byName.get(deal.item_name) ?? [deal];
      const parts = splitMultiItemName(deal.item_name);

      if (parts.length === 1) {
        entries.push({
          key: deal.id,
          label: deal.item_name,
          itemName: deal.item_name,
          deal,
          parts,
          needsSplit: false,
        });
        continue;
      }

      parts.forEach((part, index) => {
        const row = siblings[index] ?? null;
        entries.push({
          key: row ? row.id : `${deal.id}-part-${index}`,
          label: part,
          itemName: part,
          deal: row,
          parts,
          needsSplit: row === null,
        });
      });
    }
    return entries;
  }, [deals]);

  // Free-text search across all three reference tables. The automatic
  // matcher is deliberately strict (every word of the reference name
  // must appear in the item's), which is right for pricing recipes
  // unattended but leaves a reviewer stuck whenever a flyer name is
  // branded or worded differently -- Anabelle: "Can the STATCAN ITEM
  // input could be a search field if i want to reajust the ref item".
  // This is plain substring matching on purpose: she's reading the
  // results and choosing, so it should surface everything vaguely
  // related rather than apply the engine's own conservative rule.
  const referenceSearchResults = useMemo(() => {
    const query = referenceItem.trim().toLowerCase();
    if (!referenceSearchOpen || query.length < 2) return [];
    const tiers: Array<[typeof statcan, ReferenceTier]> = [
      [statcan, 'statcan'],
      [produce, 'produce'],
      [staple, 'staple'],
    ];
    const matches: Array<{ name: string; avgPrice: number; unit: string; source: ReferenceTier }> = [];
    for (const [prices, source] of tiers) {
      for (const price of prices) {
        if (price.ingredientName.toLowerCase().includes(query)) {
          matches.push({ name: price.ingredientName, avgPrice: price.avgPrice, unit: price.unit, source });
        }
      }
    }
    return matches.slice(0, 8);
  }, [referenceItem, referenceSearchOpen, statcan, produce, staple]);

  function pickReference(match: { name: string; avgPrice: number; unit: string }) {
    const split = splitReferenceUnit(match.unit);
    setReferenceItem(match.name);
    setReferencePrice(match.avgPrice.toFixed(2));
    setReferencePer(split.per);
    setReferenceUnit(split.unit);
    setReferenceState('unconfirmed');
    setReferenceSearchOpen(false);
  }

  const bestReference = useMemo(() => {
    if (!item.trim()) return undefined;
    return rankReferenceCandidates(item, statcan, produce, staple)[0];
  }, [item, statcan, produce, staple]);

  function loadDeal(deal: CuratedDeal, productName: string) {
    const observed = observedQuantity(deal, productName);
    setLoadedDeal(deal);
    setSaveError(null);
    setReferenceSearchOpen(false);
    setImageUrl(deal.image_url);
    setItem(productName);
    setPrice(deal.price != null ? String(deal.price) : '');
    setQuantity(observed.quantity);
    setUnit(observed.unit);
    setQuantityFromName(observed.fromName ?? false);
    setWasPrice(flyerWasPrice(deal));
    setOutcome(null);
    setRecipeChoice(null);
    setReferenceState('unconfirmed');

    // Prefilled from the best real reference match, then fully
    // editable -- the suggestion is a starting point, the Confirm
    // reference button is the actual decision.
    // Matched on the PRODUCT name -- "CAPERS, 125 mL" finds a capers
    // reference, where the combined cutout label would match nothing
    // useful (or worse, whichever product happens to share a word).
    const match = rankReferenceCandidates(productName, statcan, produce, staple)[0];
    if (match) {
      const split = splitReferenceUnit(match.unit);
      setReferenceItem(match.name);
      setReferencePrice(match.avgPrice.toFixed(2));
      setReferencePer(split.per);
      setReferenceUnit(split.unit);
    } else {
      setReferenceItem('');
      setReferencePrice('');
      setReferencePer('');
      setReferenceUnit('g');
    }
  }

  // Makes the extra products real rows, via the same
  // duplicate-curated-deal function dev-deals' own Duplicate button
  // uses -- one copy per missing part. Every copy keeps the combined
  // name (and comes back with pricing_reviewed_at null, so all of them
  // re-enter the backlog); each one gets its real single-product name
  // when it's confirmed, since Confirm writes the ITEM field.
  async function splitCutout(deal: CuratedDeal, missing: number) {
    setSaveError(null);
    setSplitting(true);
    for (let index = 0; index < missing; index += 1) {
      const { data, error: invokeError } = await supabase.functions.invoke<{ duplicate?: unknown; error?: string }>(
        'duplicate-curated-deal',
        { body: { deal_id: deal.id } }
      );
      if (invokeError || data?.error || !data?.duplicate) {
        setSaveError(data?.error ?? invokeError?.message ?? 'Split failed.');
        setSplitting(false);
        return;
      }
    }
    setSplitting(false);
    await reloadDeals();
  }

  function useSuggestedReference() {
    if (!bestReference) return;
    const split = splitReferenceUnit(bestReference.unit);
    setReferenceItem(bestReference.name);
    setReferencePrice(bestReference.avgPrice.toFixed(2));
    setReferencePer(split.per);
    setReferenceUnit(split.unit);
    setReferenceState('unconfirmed');
  }

  // How many more copies this cutout needs before every product it
  // names has a row of its own.
  const missingSplitRows = loadedDeal
    ? Math.max(
        0,
        splitMultiItemName(loadedDeal.item_name).length -
          deals.filter((entry) => entry.item_name === loadedDeal.item_name).length
      )
    : 0;

  const usingPreviousPrice = wasPrice.trim() !== '';
  const benchmark: Benchmark = usingPreviousPrice
    ? { kind: 'previous', price: parseFloat(wasPrice) }
    : { kind: 'reference', price: parseFloat(referencePrice), per: referencePer, unit: referenceUnit };

  const referenceUnmatched = !usingPreviousPrice && referenceState === 'unmatched';
  const ready =
    price.trim() !== '' &&
    quantity.trim() !== '' &&
    (usingPreviousPrice || referenceState === 'confirmed');
  const result = ready ? compare(parseFloat(price), quantity, unit, benchmark) : null;

  // Confirm/Reject write the review through the same Edge Function
  // dev-deals saves with -- one write path, one set of rules, rather
  // than a second one that could drift. Anabelle: "when i confirm an
  // item, it should be removed from the list".
  //
  // The function REPLACES every column in its contract, so each field
  // this screen doesn't edit is echoed back from the loaded row
  // (price_unit, package weight and its source, quantity_estimated,
  // and especially keyword_matches -- sending an empty array would
  // silently wipe hand-curated recipe-matching keywords).
  //
  // Deliberately NOT saved: the QTY/UNIT typed here. They describe what
  // the price is a price FOR so the comparison can normalize, and don't
  // map onto curated_deals.package_weight_g without assuming the deal
  // is package-priced -- correcting a real package size stays a
  // dev-deals job.
  async function submitReview(reject: boolean) {
    if (!loadedDeal) return;
    setSaveError(null);
    setSaving(true);

    // What benchmark survived review decides the original price. A
    // flyer-printed was-price is the store's own claim ('flyer'); a
    // confirmed reference is ours ('reference'); an unmatched or
    // unconfirmed reference leaves it null, which is what makes the
    // item carry no discount badge at all.
    const wasPriceNum = wasPrice.trim() === '' ? null : parseFloat(wasPrice);
    const referenceCost =
      !usingPreviousPrice && referenceState === 'confirmed' && result?.ok
        ? benchmarkCostForQuantity(result.comparison, quantity, unit)
        : undefined;
    const originalPrice = wasPriceNum ?? referenceCost ?? null;
    const originalPriceSource = wasPriceNum != null ? 'flyer' : referenceCost != null ? 'reference' : loadedDeal.original_price_source;

    const { data, error: invokeError } = await supabase.functions.invoke<{ deal?: CuratedDeal; error?: string }>(
      'update-curated-deal-pricing',
      {
        body: {
          deal_id: loadedDeal.id,
          item_name: item.trim() === '' ? loadedDeal.item_name : item.trim(),
          price: price.trim() === '' ? null : parseFloat(price),
          original_price: originalPrice,
          price_unit: loadedDeal.price_unit,
          package_weight_g: loadedDeal.package_weight_g,
          package_weight_g_source: loadedDeal.package_weight_g_source,
          quantity_estimated: loadedDeal.quantity_estimated,
          original_price_source: originalPriceSource,
          usage: recipeChoice === 'add' ? 'recipes' : recipeChoice === 'skip' ? 'deals' : loadedDeal.usage,
          keyword_matches: loadedDeal.keyword_matches ?? [],
          reject,
        },
      }
    );
    setSaving(false);

    if (invokeError || data?.error || !data?.deal) {
      setSaveError(data?.error ?? invokeError?.message ?? 'Save failed.');
      return;
    }

    // Reviewed, so it leaves the queue. The count only drops if this
    // row hadn't already been reviewed once -- re-reviewing something
    // shouldn't make the backlog look smaller than it is.
    setDeals((previous) => previous.filter((entry) => entry.id !== loadedDeal.id));
    if (loadedDeal.pricing_reviewed_at === null) {
      setToReviewCount((previous) => (previous === null ? previous : Math.max(0, previous - 1)));
    }
    setOutcome(reject ? 'rejected' : 'confirmed');
    setLoadedDeal(null);
  }

  if (!__DEV__) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.note}>This screen only exists in local development builds.</Text>
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

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.devBanner}>
          <Text style={styles.devBannerText}>DEV ONLY -- Confirm/Reject write to curated_deals</Text>
        </View>

        {toReviewCount !== null && (
          <Text style={styles.reviewCount}>
            {toReviewCount} item{toReviewCount === 1 ? '' : 's'} left to review
          </Text>
        )}

        <Text style={styles.annotation}>sample cutouts →</Text>
        {loadError && <Text style={styles.blocked}>Couldn't load deals. Check the dev server/console.</Text>}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            {chipEntries.map((entry) => (
              <Pressable
                key={entry.key}
                style={[
                  styles.chip,
                  item === entry.itemName && styles.chipSelected,
                  entry.needsSplit && styles.chipNeedsSplit,
                ]}
                onPress={() => (entry.deal ? loadDeal(entry.deal, entry.itemName) : undefined)}
                disabled={!entry.deal}
              >
                <Text
                  style={[styles.chipText, item === entry.itemName && styles.chipTextSelected]}
                  numberOfLines={1}
                >
                  {entry.label}
                  {entry.needsSplit ? ' · needs split' : ''}
                </Text>
              </Pressable>
            ))}
            {chipEntries.length === 0 && <Text style={styles.note}>No deals in the table yet.</Text>}
          </View>
        </ScrollView>

        <View style={[styles.columns, twoColumn && styles.columnsWide]}>
          <View style={[styles.column, twoColumn && styles.columnFlex]}>
            <View style={styles.block}>
              <Text style={styles.blockTitle}>FLYER CUTOUT</Text>

              {loadedDeal && splitMultiItemName(loadedDeal.item_name).length > 1 && (
                <View style={styles.splitCallout}>
                  <Text style={styles.note}>
                    This cutout prices {splitMultiItemName(loadedDeal.item_name).length} products together:
                    {splitMultiItemName(loadedDeal.item_name).map((part, index) => `\n${index + 1}. ${part}`)}
                  </Text>
                  {missingSplitRows > 0 ? (
                    <>
                      <Pressable
                        style={[styles.button, splitting && styles.buttonDisabled]}
                        onPress={() => splitCutout(loadedDeal, missingSplitRows)}
                        disabled={splitting}
                      >
                        {splitting ? (
                          <ActivityIndicator color={INK} />
                        ) : (
                          <Text style={styles.buttonText}>
                            Split into {splitMultiItemName(loadedDeal.item_name).length} separate items
                          </Text>
                        )}
                      </Pressable>
                      <Text style={styles.note}>
                        Copies this row {missingSplitRows} more time{missingSplitRows === 1 ? '' : 's'} so each
                        product gets its own size, reference and verdict. Each copy keeps the combined name until
                        you confirm it under its own.
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.note}>
                      Already split — each product has its own row. Confirming saves this one as "{item}".
                    </Text>
                  )}
                </View>
              )}

              <View style={styles.photoRow}>
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={styles.photo} resizeMode="contain" />
                ) : (
                  <View style={[styles.photo, styles.photoPlaceholder]}>
                    <Text style={styles.photoPlaceholderText}>photo</Text>
                  </View>
                )}
              </View>

              <Field label="ITEM">
                <TextInput
                  style={styles.input}
                  value={item}
                  onChangeText={setItem}
                  placeholder="item name…"
                  placeholderTextColor={MUTED}
                />
              </Field>

              <View style={styles.row}>
                <Field label="PRICE $" style={styles.flex1}>
                  <TextInput
                    style={styles.input}
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={MUTED}
                  />
                </Field>
                <Field label="QTY" style={styles.flex1}>
                  <TextInput
                    style={styles.input}
                    value={quantity}
                    onChangeText={(value) => {
                      setQuantity(value);
                      setQuantityFromName(false);
                    }}
                    keyboardType="decimal-pad"
                    placeholder="750"
                    placeholderTextColor={MUTED}
                  />
                </Field>
              </View>

              <Field label="UNIT">
                <SegmentedControl
                  options={UNIT_OPTIONS}
                  value={unit}
                  onChange={(value) => {
                    setUnit(value);
                    setQuantityFromName(false);
                  }}
                />
              </Field>
              {quantityFromName && (
                <Text style={styles.note}>
                  ⚠ size read from the item name — no package size stored on this deal. Check it.
                </Text>
              )}

              <Field label="ORIGINAL / WAS PRICE $">
                <TextInput
                  style={styles.input}
                  value={wasPrice}
                  onChangeText={setWasPrice}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 7.79"
                  placeholderTextColor={MUTED}
                />
              </Field>
              <Text style={styles.note}>
                {usingPreviousPrice
                  ? '↓ previous price found — comparing against it (StatCan disabled)'
                  : '↓ no previous price — using StatCan reference'}
              </Text>
            </View>

            {usingPreviousPrice ? (
              <View style={styles.block}>
                <Text style={styles.note}>
                  StatCan reference disabled — flyer lists a previous price (${wasPrice}), so it's used as the
                  benchmark.
                </Text>
              </View>
            ) : (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>REFERENCE · STATCAN</Text>

                <Field label="STATCAN ITEM">
                  <TextInput
                    style={styles.input}
                    value={referenceItem}
                    onChangeText={(value) => {
                      editReference(setReferenceItem)(value);
                      setReferenceSearchOpen(true);
                    }}
                    placeholder="search reference prices…"
                    placeholderTextColor={MUTED}
                  />
                </Field>

                {referenceSearchResults.map((match) => (
                  <Pressable
                    key={`${match.source}-${match.name}-${match.unit}`}
                    style={styles.searchResult}
                    onPress={() => pickReference(match)}
                  >
                    <Text style={styles.searchResultName}>{match.name}</Text>
                    <Text style={styles.searchResultMeta}>
                      ${match.avgPrice.toFixed(2)} / {match.unit} · {match.source}
                    </Text>
                  </Pressable>
                ))}
                {referenceSearchOpen && referenceItem.trim().length >= 2 && referenceSearchResults.length === 0 && (
                  <Text style={styles.note}>
                    No reference on file for "{referenceItem.trim()}". Either type a price/per/unit in below, or
                    mark it not a valid match — an item with no benchmark still prices in recipes, it just
                    carries no badge.
                  </Text>
                )}

                {bestReference && bestReference.name !== referenceItem && (
                  <Pressable onPress={useSuggestedReference} hitSlop={8}>
                    <Text style={styles.link}>
                      Use match: {bestReference.name} — ${bestReference.avgPrice.toFixed(2)} / {bestReference.unit} (
                      {bestReference.source})
                    </Text>
                  </Pressable>
                )}
                {!bestReference && item.trim() !== '' && !referenceSearchOpen && (
                  <Text style={styles.note}>
                    Nothing matched "{item}" automatically — normal for a branded or oddly-worded flyer name.
                    Search the field above by any word (e.g. "olives"), or mark it not a valid match.
                  </Text>
                )}

                <View style={styles.row}>
                  <Field label="REF PRICE $" style={styles.flex1}>
                    <TextInput
                      style={styles.input}
                      value={referencePrice}
                      onChangeText={editReference(setReferencePrice)}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={MUTED}
                    />
                  </Field>
                  <Field label="PER" style={styles.flex1}>
                    <TextInput
                      style={styles.input}
                      value={referencePer}
                      onChangeText={editReference(setReferencePer)}
                      keyboardType="decimal-pad"
                      placeholder="100"
                      placeholderTextColor={MUTED}
                    />
                  </Field>
                </View>

                <Field label="UNIT">
                  <SegmentedControl
                    options={UNIT_OPTIONS}
                    value={referenceUnit}
                    onChange={(value) => {
                      setReferenceUnit(value);
                      setReferenceState('unconfirmed');
                    }}
                  />
                </Field>

                <View style={styles.confirmRow}>
                  {referenceState === 'confirmed' && <Text style={styles.note}>✓ reference confirmed</Text>}
                  {referenceState === 'unmatched' && (
                    <Text style={styles.note}>✗ not a valid comparison — no benchmark used</Text>
                  )}
                  <Pressable style={styles.button} onPress={() => setReferenceState('confirmed')}>
                    <Text style={styles.buttonText}>Confirm reference</Text>
                  </Pressable>
                  <Pressable style={styles.button} onPress={() => setReferenceState('unmatched')}>
                    <Text style={styles.buttonText}>Not a valid match</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>

          <View style={[styles.column, twoColumn && styles.columnFlex]}>
            <Text style={styles.annotation}>result panel</Text>
            <View style={styles.block}>
              <Text style={styles.blockHeading}>Comparison</Text>

              <ResultRow label="flyer" value={price ? `${formatMoney(parseFloat(price))} / ${quantity}${unit}` : '—'} />
              {usingPreviousPrice ? (
                <ResultRow label="was" value={`${formatMoney(parseFloat(wasPrice))} / ${quantity}${unit}`} />
              ) : (
                <>
                  <ResultRow
                    label="ref"
                    value={
                      referenceUnmatched
                        ? 'not used'
                        : referencePrice
                          ? `${formatMoney(parseFloat(referencePrice))} / ${referencePer}${referenceUnit}`
                          : '—'
                    }
                  />
                  <ResultRow
                    label="matched"
                    value={referenceUnmatched ? `${referenceItem || '—'} — rejected` : referenceItem || '—'}
                  />
                </>
              )}

              {referenceUnmatched && (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.verdictSentence}>No valid benchmark</Text>
                  <Text style={styles.note}>
                    Nothing honest to compare this price against — the suggested reference isn't the same
                    product. The item is still perfectly usable: it prices normally in a recipe, it just carries
                    no discount badge, since a badge would have to claim a saving nobody can back up.
                  </Text>
                  <Text style={styles.note}>
                    Confirming below saves it with no original price, which is what leaves it badge-less. No
                    reference row is touched.
                  </Text>
                </>
              )}

              {!result && !referenceUnmatched && (
                <Text style={styles.note}>
                  {usingPreviousPrice
                    ? 'Enter the price and quantity to compare.'
                    : 'Confirm the reference, or mark it not a valid match.'}
                </Text>
              )}

              {result && !result.ok && <Text style={styles.blocked}>{result.reason}</Text>}

              {result?.ok && (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.normalizedNote}>normalized → per {result.comparison.basisLabel}</Text>

                  <View style={styles.headlineRow}>
                    <Text style={styles.resultLabel}>this item</Text>
                    <Text style={styles.headline}>
                      {formatMoney(result.comparison.itemPerBasis)}/{result.comparison.basisLabel}
                    </Text>
                  </View>
                  <ResultRow
                    label={usingPreviousPrice ? 'was' : 'benchmark'}
                    value={`${formatMoney(result.comparison.benchmarkPerBasis)}/${result.comparison.basisLabel}`}
                  />

                  <View style={styles.stamp}>
                    <Text style={styles.stampText}>{result.comparison.verdict}</Text>
                  </View>

                  <Text style={styles.verdictSentence}>{formatVerdictSentence(result.comparison)}</Text>
                  <Text style={styles.note}>{formatPctVsBenchmark(result.comparison)}</Text>
                </>
              )}
            </View>

            <Text style={styles.annotation}>add this item to your recipes?</Text>
            <View style={styles.row}>
              <Pressable
                style={[styles.radioChip, recipeChoice === 'add' && styles.radioChipSelected]}
                onPress={() => setRecipeChoice('add')}
              >
                <Text style={[styles.chipText, recipeChoice === 'add' && styles.chipTextSelected]}>
                  {recipeChoice === 'add' ? '●' : '○'} Add to recipes
                </Text>
              </Pressable>
              <Pressable
                style={[styles.radioChip, recipeChoice === 'skip' && styles.radioChipSelected]}
                onPress={() => setRecipeChoice('skip')}
              >
                <Text style={[styles.chipText, recipeChoice === 'skip' && styles.chipTextSelected]}>
                  {recipeChoice === 'skip' ? '●' : '○'} Don't add to recipes
                </Text>
              </Pressable>
            </View>

            <View style={styles.row}>
              <Pressable
                style={[styles.button, styles.flex1, (!loadedDeal || saving) && styles.buttonDisabled]}
                onPress={() => submitReview(false)}
                disabled={!loadedDeal || saving}
              >
                {saving ? <ActivityIndicator color={INK} /> : <Text style={styles.buttonText}>Confirm</Text>}
              </Pressable>
              <Pressable
                style={[styles.button, styles.flex1, (!loadedDeal || saving) && styles.buttonDisabled]}
                onPress={() => submitReview(true)}
                disabled={!loadedDeal || saving}
              >
                <Text style={styles.buttonText}>Reject</Text>
              </Pressable>
            </View>

            {!loadedDeal && !outcome && (
              <Text style={styles.note}>
                Pick a cutout above to review — Confirm/Reject save against a real deal, so they're inert for
                hand-typed items.
              </Text>
            )}
            {saveError && <Text style={styles.blocked}>{saveError}</Text>}

            {outcome && (
              <Text style={styles.note}>
                {outcome === 'confirmed' ? 'Confirmed' : 'Rejected'}
                {recipeChoice === 'add'
                  ? ' · added to recipes'
                  : recipeChoice === 'skip'
                    ? ' · not added to recipes'
                    : ''}
                {' — saved and removed from the list. Quantity/unit are comparison-only and were not saved.'}
              </Text>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.resultRow}>
      <Text style={styles.resultLabel}>{label}</Text>
      <Text style={styles.resultValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFEAD4' },
  centered: { alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 80, gap: 12 },
  devBanner: {
    backgroundColor: INK,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  devBannerText: { color: '#fff', fontSize: 12, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  annotation: { fontSize: 12, color: MUTED, marginTop: 4 },
  reviewCount: { fontSize: 18, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK, marginTop: 4 },
  columns: { gap: 16 },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  // No flex here on purpose. When the two columns STACK (narrow
  // screens), the wrapper is a column flex container inside a
  // ScrollView whose height is unbounded -- `flex: 1` on both children
  // then makes them share a height that doesn't exist, so each renders
  // shorter than its own content and the result panel draws straight
  // over the reference block (Anabelle: "what is going on here", with
  // the Comparison card sitting on top of REF PRICE / PER). Stacked,
  // each column must take its natural content height; only the
  // side-by-side layout wants them to share the row equally.
  column: { gap: 12 },
  columnFlex: { flex: 1 },
  block: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  blockTitle: { fontSize: 11, letterSpacing: 1, color: MUTED, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  blockHeading: { fontSize: 16, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  searchResult: {
    borderWidth: 1.5,
    borderColor: RULE,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 2,
  },
  searchResultName: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  searchResultMeta: { fontSize: 12, color: MUTED },
  splitCallout: { gap: 8, borderWidth: 1.5, borderColor: RULE, borderRadius: 10, padding: 10 },
  photoRow: { alignItems: 'flex-start' },
  photo: { width: 120, height: 90, borderRadius: 8 },
  photoPlaceholder: {
    borderWidth: 1.5,
    borderColor: RULE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F7F7',
  },
  photoPlaceholderText: { fontSize: 12, color: MUTED },
  field: { gap: 4 },
  fieldLabel: { fontSize: 11, letterSpacing: 0.8, color: MUTED, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  input: {
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: INK,
    backgroundColor: '#fff',
  },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  flex1: { flex: 1 },
  note: { fontSize: 12, color: MUTED },
  blocked: { fontSize: 13, color: '#D0342C', fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  link: { fontSize: 12, color: INK, textDecorationLine: 'underline' },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  chip: {
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    maxWidth: 260,
  },
  chipSelected: { backgroundColor: INK },
  chipNeedsSplit: { borderStyle: 'dashed', opacity: 0.55 },
  chipText: { fontSize: 12, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  chipTextSelected: { color: '#fff' },
  radioChip: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  radioChipSelected: { backgroundColor: INK },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  button: {
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  buttonText: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  buttonDisabled: { opacity: 0.4 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  resultLabel: { fontSize: 12, color: MUTED },
  resultValue: { fontSize: 13, color: INK, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  divider: { height: 1, backgroundColor: RULE, marginVertical: 4 },
  normalizedNote: { fontSize: 11, color: MUTED, letterSpacing: 0.5 },
  headlineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  headline: { fontSize: 26, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  stamp: {
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 20,
    alignSelf: 'center',
    marginTop: 8,
  },
  stampText: { fontSize: 18, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK, letterSpacing: 2 },
  verdictSentence: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK, textAlign: 'center' },
});
