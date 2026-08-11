import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CheckIcon } from 'react-native-heroicons/outline';

import { InputField } from '../components/InputField';
import { SegmentedControl } from '../components/SegmentedControl';
import { supabase } from '../lib/supabase';
import type { Database, Tables } from '../types/database';

const INK = '#111';

type CuratedDeal = Tables<'curated_deals'>;
type PriceUnit = Database['public']['Enums']['deal_price_unit'];
type PackageWeightSource = 'label' | 'measured' | 'estimated';
type OriginalPriceSource = 'flyer' | 'reference';

const PRICE_UNIT_OPTIONS: { value: PriceUnit; label: string }[] = [
  { value: 'package', label: 'Package' },
  { value: 'each', label: 'Each' },
  { value: 'lb', label: 'lb' },
  { value: 'kg', label: 'kg' },
  { value: '100g', label: '100g' },
];

const PACKAGE_WEIGHT_SOURCE_OPTIONS: { value: PackageWeightSource; label: string }[] = [
  { value: 'label', label: 'Label' },
  { value: 'measured', label: 'Measured' },
  { value: 'estimated', label: 'Estimated' },
];

// See supabase/migrations/20260812000000_curated_deals_original_price_source.sql
// -- 'flyer' means original_price is a real price the store printed;
// 'reference' means it's a StatCan/human-researched comparison price WE
// derived for a price-only produce item, never printed anywhere. The
// live app never shows a 'reference' one as a strikethrough "was $X" --
// see app/lib/curatedDeals.ts.
const ORIGINAL_PRICE_SOURCE_OPTIONS: { value: OriginalPriceSource; label: string }[] = [
  { value: 'flyer', label: 'Flyer (store printed it)' },
  { value: 'reference', label: 'Reference (we calculated it)' },
];

// Every real multi-item cutout found this session (CARIBBEAN AVOCADOS
// or OKRA, FREYBE LYONER SAUSAGE... OR MAPLE LEAF..., MCCAIN
// SUPERFRIES or SPECIALTY FRIES... or POCKETS, PC WHOLE CREMINI or
// WHITE MUSHROOMS, etc.) names both products joined by the standalone
// word "or" -- the flyer's own "choose either X or Y at this price"
// convention. The Duplicate button used to show on every row
// regardless (there's no way to know from a photo alone), which read
// as a false claim on the ~90% of rows that are single-item -- Anabelle
// confirmed the "or"-joined pattern is the actual, only case where
// duplicating is ever needed, so gate on it instead of showing
// unconditionally. \bor\b (not a bare substring match) so this doesn't
// false-positive on "Original", "Organic", "Orville", etc.
const MULTI_ITEM_NAME_PATTERN = /\bor\b/i;
function looksLikeMultiItemCutout(itemName: string): boolean {
  return MULTI_ITEM_NAME_PATTERN.test(itemName);
}

// Internal-only pricing review screen -- built after finding real
// pricing bugs in curated_deals this session (a per-lb flyer rate
// credited as a flat package total; a "2 for $X" multi-buy rate
// stored as the single-unit price with price/original_price backwards)
// that all trace back to the same root cause: nothing upstream (flyer
// scraper, Airtable review) records what a stored price actually
// represents. Anabelle explicitly wants to look at each deal's own
// cutout photo (already stored, image_url) and correct
// price/original_price/price_unit/package_weight_g/quantity_estimated
// by hand here, rather than a one-off data patch -- see
// supabase/migrations/20260811000000_curated_deals_pricing_review.sql
// for the schema/pricing-function side of this.
//
// __DEV__ is React Native's standard global, true only in a local dev
// build -- this screen (and the Edge Function it calls) can't do
// anything in a real build, even if someone finds the URL. Same
// pattern as dev-recipes.tsx.
export default function DevDealsScreen() {
  const [deals, setDeals] = useState<CuratedDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadDeals = () => {
    setLoading(true);
    // Scoped to approved deals -- this screen corrects pricing detail
    // on deals already live in the app, it doesn't replace the
    // separate Airtable pending->approved workflow (out of scope, see
    // the plan this screen was built from).
    //
    // Wrapped in Promise.resolve(): the Supabase query builder returns
    // a PromiseLike, not a real Promise, until awaited -- .finally()
    // isn't on that interface, unlike dev-recipes.tsx's
    // fetchAllRecipes() (a real async function already returning a
    // true Promise).
    Promise.resolve(
      supabase.from('curated_deals').select('*').eq('status', 'approved').order('item_name')
    )
      .then(({ data, error: fetchError }) => {
        if (fetchError) {
          setError(true);
        } else {
          setDeals(data ?? []);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(loadDeals, []);

  if (!__DEV__) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.notDevText}>This screen only exists in local development builds.</Text>
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

  if (error) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.notDevText}>Couldn't load deals. Check the dev server/console.</Text>
      </View>
    );
  }

  const selectedDeal = deals.find((d) => d.id === selectedId) ?? null;

  if (selectedDeal) {
    return (
      <DealEditView
        deal={selectedDeal}
        onBack={() => setSelectedId(null)}
        onSaved={(updated) => {
          // A rejected deal is no longer 'approved' -- drop it from
          // this list entirely (it was only ever fetched
          // status='approved') rather than leaving a stale rejected
          // row visible until the next full reload.
          setDeals((prev) =>
            updated.status === 'approved'
              ? prev.map((d) => (d.id === updated.id ? updated : d))
              : prev.filter((d) => d.id !== updated.id)
          );
          setSelectedId(null);
        }}
        onDuplicated={(source, duplicate) => {
          // Both rows come back with pricing_reviewed_at reset to null
          // (see duplicate-curated-deal/index.ts) -- update the source
          // in place, add the new duplicate, then jump straight into
          // editing the duplicate (the obviously incomplete one).
          setDeals((prev) => [...prev.map((d) => (d.id === source.id ? source : d)), duplicate]);
          setSelectedId(duplicate.id);
        }}
      />
    );
  }

  const filtered = deals
    .filter((d) => !onlyUnreviewed || d.pricing_reviewed_at === null)
    .filter((d) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return d.item_name.toLowerCase().includes(q) || d.chain_name.toLowerCase().includes(q);
    })
    // Unreviewed-first, then alphabetical -- so the actual work queue
    // (rows nobody has looked at yet) surfaces before already-confirmed
    // rows even with the filter off.
    .sort((a, b) => {
      const aReviewed = a.pricing_reviewed_at !== null;
      const bReviewed = b.pricing_reviewed_at !== null;
      if (aReviewed !== bReviewed) return aReviewed ? 1 : -1;
      return a.item_name.localeCompare(b.item_name);
    });

  const unreviewedCount = deals.filter((d) => d.pricing_reviewed_at === null).length;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.devBanner}>
          <Text style={styles.devBannerText}>DEV ONLY -- pricing review, no login</Text>
        </View>
        <Text style={styles.title}>Deal Pricing Review</Text>
        <Text style={styles.subtitle}>
          {deals.length} approved deal{deals.length === 1 ? '' : 's'} · {unreviewedCount} not yet reviewed
        </Text>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by item or store..."
          placeholderTextColor="#999"
          style={styles.searchInput}
        />

        <Pressable style={styles.filterRow} onPress={() => setOnlyUnreviewed((v) => !v)}>
          <View style={[styles.checkbox, onlyUnreviewed && styles.checkboxChecked]}>
            {onlyUnreviewed && <CheckIcon size={12} color="#fff" />}
          </View>
          <Text style={styles.filterLabel}>Only show not-yet-reviewed</Text>
        </Pressable>

        {filtered.map((deal) => (
          <Pressable key={deal.id} style={styles.dealRow} onPress={() => setSelectedId(deal.id)}>
            {deal.image_url ? (
              <Image source={{ uri: deal.image_url }} style={styles.dealThumb} resizeMode="cover" />
            ) : (
              <View style={styles.dealThumb} />
            )}
            <View style={styles.dealRowInfo}>
              <Text style={styles.dealRowName} numberOfLines={2}>
                {deal.item_name}
              </Text>
              <Text style={styles.dealRowStore}>{deal.chain_name}</Text>
              <View style={styles.dealRowPriceLine}>
                <Text style={styles.dealRowPrice}>
                  {deal.price != null ? `$${deal.price.toFixed(2)}` : 'Unknown'}{' '}
                  <Text style={styles.dealRowOriginal}>
                    {deal.original_price != null ? `$${deal.original_price.toFixed(2)}` : 'Unknown'}
                  </Text>
                </Text>
                <View style={styles.unitBadge}>
                  <Text style={styles.unitBadgeText}>{deal.price_unit}</Text>
                </View>
                {deal.pricing_reviewed_at === null && (
                  <View style={styles.unreviewedBadge}>
                    <Text style={styles.unreviewedBadgeText}>Not reviewed</Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
        ))}

        {filtered.length === 0 && <Text style={styles.emptyText}>No deals match.</Text>}
      </ScrollView>
    </View>
  );
}

interface DealEditViewProps {
  deal: CuratedDeal;
  onBack: () => void;
  onSaved: (deal: CuratedDeal) => void;
  onDuplicated: (source: CuratedDeal, duplicate: CuratedDeal) => void;
}

function DealEditView({ deal, onBack, onSaved, onDuplicated }: DealEditViewProps) {
  const [itemName, setItemName] = useState(deal.item_name);
  const [price, setPrice] = useState(deal.price != null ? String(deal.price) : '');
  const [priceUnknown, setPriceUnknown] = useState(deal.price === null);
  const [originalPrice, setOriginalPrice] = useState(deal.original_price != null ? String(deal.original_price) : '');
  const [originalPriceUnknown, setOriginalPriceUnknown] = useState(deal.original_price === null);
  const [priceUnit, setPriceUnit] = useState<PriceUnit>(deal.price_unit);
  const [packageWeightG, setPackageWeightG] = useState(deal.package_weight_g != null ? String(deal.package_weight_g) : '');
  const [packageWeightSource, setPackageWeightSource] = useState<PackageWeightSource | null>(
    (deal.package_weight_g_source as PackageWeightSource | null) ?? null
  );
  const [quantityEstimated, setQuantityEstimated] = useState(deal.quantity_estimated);
  const [originalPriceSource, setOriginalPriceSource] = useState<OriginalPriceSource>(
    deal.original_price_source as OriginalPriceSource
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [prefillChecked, setPrefillChecked] = useState(false);

  // One-time, read-only convenience: if this deal already has a
  // measured/estimated package weight on file for NUTRITION purposes
  // (deal_item_nutrition_reference, matched by exact item_name -- same
  // convention refresh_recipe_deal_tags() itself uses), pre-fill the
  // pricing package_weight_g field from it as a starting point, freely
  // overwritable. No schema coupling -- this is a one-way read only;
  // see the plan's rationale for why package_weight_g isn't reused
  // directly from that table.
  useEffect(() => {
    if (packageWeightG || prefillChecked) return;
    setPrefillChecked(true);
    supabase
      .from('deal_item_nutrition_reference')
      .select('package_grams, package_grams_source')
      .eq('item_name', deal.item_name)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.package_grams != null) {
          setPackageWeightG(String(data.package_grams));
          if (data.package_grams_source === 'label' || data.package_grams_source === 'estimated') {
            setPackageWeightSource(data.package_grams_source);
          }
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.item_name]);

  // Read-only decision aid, not an auto-fill: when the flyer doesn't
  // give a clear original/regular price to compare against, look up
  // whether this item's name matches a StatCan/produce/staple
  // reference price (find_reference_price() RPC -- same word-subset
  // matching convention refresh_recipe_deal_tags() already uses for
  // staple ingredients) and show it so the reviewer can judge deal vs.
  // fair price vs. reject herself. Only ever finds a match for items
  // whose name contains a generic staple/produce term -- most branded/
  // packaged goods genuinely have nothing to compare against, and
  // that's expected, not a bug (see the migration's own comment).
  const [referencePrice, setReferencePrice] = useState<{ source: string; matchedName: string; price: number; unit: string } | null>(
    null
  );
  const [referencePriceChecked, setReferencePriceChecked] = useState(false);
  useEffect(() => {
    // Promise.resolve(): same PromiseLike-vs-Promise gap noted on
    // loadDeals above -- the query builder has no .finally() until
    // awaited/wrapped.
    Promise.resolve(supabase.rpc('find_reference_price', { p_item_name: deal.item_name }))
      .then(({ data }) => {
        const match = data?.[0];
        if (match) {
          setReferencePrice({
            source: match.source,
            matchedName: match.matched_name,
            price: match.result_price,
            unit: match.result_unit,
          });
        }
      })
      .finally(() => setReferencePriceChecked(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.item_name]);

  // Shared by both Save and Reject -- a reject action still saves
  // whatever price/quantity fields were filled in at the same time
  // (see the Edge Function's own comment), so both buttons go through
  // the same validation/body-building, differing only in the trailing
  // `reject` flag.
  function buildBody(): { body: Record<string, unknown> } | { error: string } {
    const trimmedName = itemName.trim();
    const priceNum = priceUnknown ? null : parseFloat(price);
    const originalPriceNum = originalPriceUnknown ? null : parseFloat(originalPrice);
    const weightNum = packageWeightG.trim() === '' ? null : parseFloat(packageWeightG);

    if (trimmedName === '') {
      return { error: 'Item name cannot be blank.' };
    }
    if (priceNum !== null && (Number.isNaN(priceNum) || priceNum < 0)) {
      return { error: 'Price must be blank/unknown or a non-negative number.' };
    }
    if (originalPriceNum !== null && (Number.isNaN(originalPriceNum) || originalPriceNum < 0)) {
      return { error: 'Original price must be blank/unknown or a non-negative number.' };
    }
    if (weightNum !== null && (Number.isNaN(weightNum) || weightNum <= 0)) {
      return { error: 'Package weight must be blank or a positive number.' };
    }

    return {
      body: {
        deal_id: deal.id,
        item_name: trimmedName,
        price: priceNum,
        original_price: originalPriceNum,
        price_unit: priceUnit,
        package_weight_g: weightNum,
        package_weight_g_source: weightNum === null ? null : packageWeightSource,
        quantity_estimated: quantityEstimated,
        original_price_source: originalPriceSource,
      },
    };
  }

  async function submit(extra: Record<string, unknown>) {
    setSaveError(null);
    const built = buildBody();
    if ('error' in built) {
      setSaveError(built.error);
      return;
    }

    setSaving(true);
    const { data, error: invokeError } = await supabase.functions.invoke<{ deal?: CuratedDeal; error?: string }>(
      'update-curated-deal-pricing',
      { body: { ...built.body, ...extra } }
    );
    setSaving(false);

    if (invokeError || !data?.deal) {
      setSaveError(data?.error ?? invokeError?.message ?? 'Save failed.');
      return;
    }
    onSaved(data.deal);
  }

  const handleSave = () => submit({});
  // "Not a good deal, or any [other reason]" -- a general-purpose
  // reject, no reason required. Sets status='rejected' server-side,
  // which immediately excludes it from refresh_recipe_deal_tags().
  const handleReject = () => submit({ reject: true });

  const [duplicating, setDuplicating] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  // For a cutout naming two distinct products sharing one photo/price
  // (e.g. "BOURSIN CHEESE ... or MARCANGELO CHARCUTERIE ...") -- splits
  // this row into two via the duplicate-curated-deal Edge Function,
  // then jumps straight into editing the new copy (the most obviously
  // incomplete one -- freshly copied, still has the combined name,
  // needs renaming/re-pricing). The original stays in the list, also
  // flagged "Not reviewed" again until its own name/price is confirmed.
  async function handleDuplicate() {
    setDuplicateError(null);
    setDuplicating(true);
    const { data, error: invokeError } = await supabase.functions.invoke<{
      source?: CuratedDeal;
      duplicate?: CuratedDeal;
      error?: string;
    }>('duplicate-curated-deal', { body: { deal_id: deal.id } });
    setDuplicating(false);

    if (invokeError || !data?.source || !data?.duplicate) {
      setDuplicateError(data?.error ?? invokeError?.message ?? 'Duplicate failed.');
      return;
    }
    onDuplicated(data.source, data.duplicate);
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.backLink}>← Back to list</Text>
        </Pressable>

        {deal.image_url && <Image source={{ uri: deal.image_url }} style={styles.editPhoto} resizeMode="contain" />}

        <Text style={styles.fieldLabel}>Item name</Text>
        <InputField value={itemName} onChangeText={setItemName} placeholder="Item name" />
        <Text style={styles.editStore}>{deal.chain_name}</Text>

        {looksLikeMultiItemCutout(itemName) && (
          <>
            <Pressable
              style={[styles.duplicateButton, duplicating && styles.saveButtonDisabled]}
              onPress={handleDuplicate}
              disabled={duplicating}
            >
              {duplicating ? (
                <ActivityIndicator color={INK} />
              ) : (
                <Text style={styles.duplicateButtonText}>Duplicate -- this cutout looks like 2 items</Text>
              )}
            </Pressable>
            {duplicateError && <Text style={styles.saveError}>{duplicateError}</Text>}
          </>
        )}

        {referencePrice && (
          <View style={styles.referenceCard}>
            <Text style={styles.referenceCardTitle}>
              Reference price found ({referencePrice.source}): {referencePrice.matchedName}
            </Text>
            <Text style={styles.referenceCardPrice}>
              ${referencePrice.price.toFixed(2)} / {referencePrice.unit}
            </Text>
            <Text style={styles.referenceCardNote}>
              Informational only -- not filled in for you. Use it to judge whether this is a real deal, a fair
              price, or worth rejecting.
            </Text>
          </View>
        )}
        {referencePriceChecked && !referencePrice && (
          <Text style={styles.referenceCardNote}>
            No StatCan/produce/staple reference match for this item -- common for branded/packaged goods,
            those tables don't cover most of them.
          </Text>
        )}

        <Text style={styles.fieldLabel}>Price</Text>
        <InputField
          value={priceUnknown ? '' : price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          placeholder={priceUnknown ? 'Unknown' : '0.00'}
          disabled={priceUnknown}
        />
        <Pressable style={styles.filterRow} onPress={() => setPriceUnknown((v) => !v)}>
          <View style={[styles.checkbox, priceUnknown && styles.checkboxChecked]}>
            {priceUnknown && <CheckIcon size={12} color="#fff" />}
          </View>
          <Text style={styles.filterLabel}>Price is unknown</Text>
        </Pressable>

        <Text style={styles.fieldLabel}>Original price</Text>
        <InputField
          value={originalPriceUnknown ? '' : originalPrice}
          onChangeText={setOriginalPrice}
          keyboardType="decimal-pad"
          placeholder={originalPriceUnknown ? 'Unknown' : '0.00'}
          disabled={originalPriceUnknown}
        />
        <Pressable style={styles.filterRow} onPress={() => setOriginalPriceUnknown((v) => !v)}>
          <View style={[styles.checkbox, originalPriceUnknown && styles.checkboxChecked]}>
            {originalPriceUnknown && <CheckIcon size={12} color="#fff" />}
          </View>
          <Text style={styles.filterLabel}>Original price is unknown</Text>
        </Pressable>

        <Text style={styles.fieldLabel}>Where did the original price come from?</Text>
        <SegmentedControl
          options={ORIGINAL_PRICE_SOURCE_OPTIONS}
          value={originalPriceSource}
          onChange={setOriginalPriceSource}
        />

        <Text style={styles.fieldLabel}>What is the price denominated in?</Text>
        <SegmentedControl options={PRICE_UNIT_OPTIONS} value={priceUnit} onChange={setPriceUnit} />

        {priceUnit !== 'package' && priceUnit !== 'each' && (
          <>
            <Text style={styles.fieldLabel}>Package weight (g) -- leave blank if genuinely bulk/loose</Text>
            <InputField
              value={packageWeightG}
              onChangeText={setPackageWeightG}
              keyboardType="decimal-pad"
              placeholder="e.g. 900"
            />
            {packageWeightG.trim() !== '' && (
              <>
                <Text style={styles.fieldLabel}>Where did that weight come from?</Text>
                <SegmentedControl
                  options={PACKAGE_WEIGHT_SOURCE_OPTIONS}
                  value={packageWeightSource}
                  onChange={setPackageWeightSource}
                />
              </>
            )}
          </>
        )}

        <Pressable style={styles.filterRow} onPress={() => setQuantityEstimated((v) => !v)}>
          <View style={[styles.checkbox, quantityEstimated && styles.checkboxChecked]}>
            {quantityEstimated && <CheckIcon size={12} color="#fff" />}
          </View>
          <Text style={styles.filterLabel}>Quantity is an estimate, not stated on the flyer</Text>
        </Pressable>

        {saveError && <Text style={styles.saveError}>{saveError}</Text>}

        <View style={styles.actionRow}>
          <Pressable
            style={[styles.rejectButton, saving && styles.saveButtonDisabled]}
            onPress={handleReject}
            disabled={saving}
          >
            <Text style={styles.rejectButtonText}>Reject</Text>
          </Pressable>
          <Pressable
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFEAD4' },
  centered: { alignItems: 'center', justifyContent: 'center' },
  notDevText: { padding: 24, fontSize: 15, color: '#888', textAlign: 'center' },
  scrollContent: { padding: 20, paddingTop: 60, gap: 12 },
  devBanner: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  devBannerText: { color: '#fff', fontSize: 12, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  title: { fontSize: 24, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  subtitle: { fontSize: 14, color: INK, fontWeight: '700', fontFamily: 'OpenSans_700Bold', marginTop: -6, marginBottom: 4 },
  searchInput: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 28,
    paddingVertical: 12,
    paddingHorizontal: 18,
    fontSize: 15,
  },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxChecked: { backgroundColor: '#111', borderColor: '#111' },
  filterLabel: { fontSize: 14, color: INK },
  dealRow: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 16,
    padding: 12,
  },
  dealThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#F2F2F2' },
  dealRowInfo: { flex: 1, gap: 2 },
  dealRowName: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  dealRowStore: { fontSize: 12, color: '#767676' },
  dealRowPriceLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  dealRowPrice: { fontSize: 14, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  dealRowOriginal: { fontSize: 12, fontWeight: '400', color: '#aaa', textDecorationLine: 'line-through' },
  unitBadge: { backgroundColor: '#F2F2F2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  unitBadgeText: { fontSize: 11, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: '#666' },
  unreviewedBadge: { backgroundColor: '#FFA955', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  unreviewedBadgeText: { fontSize: 11, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  emptyText: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 24 },
  backLink: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  editPhoto: { width: '100%', height: 220, borderRadius: 16, backgroundColor: '#F2F2F2' },
  editStore: { fontSize: 14, color: '#767676', marginTop: -8 },
  // A structural action (splits the row in two), so it gets its own
  // color rather than reusing the INK-outlined convention used
  // elsewhere on this screen.
  duplicateButton: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  duplicateButtonText: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: '#3B82F6' },
  referenceCard: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#96E696',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  referenceCardTitle: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  referenceCardPrice: { fontSize: 16, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  referenceCardNote: { fontSize: 12, color: '#767676' },
  fieldLabel: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK, marginTop: 4 },
  saveError: { color: '#D0342C', fontSize: 14 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  saveButton: {
    flex: 1,
    backgroundColor: INK,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  // "Not a good deal, or any other reason" -- a general-purpose reject,
  // no reason required. Outlined (not filled) so it doesn't read as
  // the row's primary action -- Save still is.
  rejectButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#D0342C',
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectButtonText: { color: '#D0342C', fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
});
