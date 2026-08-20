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
type DealUsage = 'recipes' | 'deals';
type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';

// See supabase/migrations/20260819010000_curated_deals_usage_classification.sql
// and 20260819030000_curated_deals_usage_drop_both.sql -- Anabelle's
// own recipes/deals classification for whether a deal is eligible to
// price/tag a recipe ingredient. Started as a 3rd option, 'both', but
// that turned out to be functionally identical to 'recipes' (neither
// affects Deals-tab visibility -- every approved deal shows there
// regardless) -- Anabelle: "oh yeah got it both is now redundant".
// Simplified to the clean binary she actually described from the
// start: "recipe only... vs deals only".
const USAGE_OPTIONS: { value: DealUsage; label: string }[] = [
  { value: 'recipes', label: 'Use in recipes' },
  { value: 'deals', label: "Don't use in recipes" },
];

// Anabelle: "why do I approve deals twice: in Airtable and in the page
// dev-deals" / "I would like to do all at once in dev-deals" -- her
// whole review (approve/correct/reject) now happens here. Every
// candidate syncs in as 'pending' (see scripts/sync_weekly_deals.py),
// so that's the default tab -- the actual weekly work queue.
const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'pending', label: 'Needs review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

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
  // Defaults false now that 'pending' is the common weekly state for a
  // fresh candidate -- forcing this on by default risked hiding a
  // pending row that has stale carried-forward pricing metadata but a
  // genuinely new price this week. The "Needs review" status tab does
  // the primary narrowing instead.
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadDeals = () => {
    setLoading(true);
    // The direct table query used to be scoped .eq('status', 'approved')
    // -- but the only RLS policy on curated_deals ("approved
    // curated_deals are publicly readable") applies to the SAME
    // anon-key client this screen uses, so a plain query can never see
    // a pending/rejected row no matter what it asks for -- Postgres
    // filters it out before the query even runs. list-curated-deals-
    // for-review is a service-role-backed Edge Function built
    // specifically to give this __DEV__-only screen a real, all-status
    // view (see that function's own header comment for the full
    // reasoning).
    Promise.resolve(
      supabase.functions.invoke<{ deals?: CuratedDeal[]; error?: string }>('list-curated-deals-for-review', {
        body: {},
      })
    )
      .then(({ data, error: fetchError }) => {
        if (fetchError || !data?.deals) {
          setError(true);
        } else {
          setDeals(data.deals);
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
          // Every status is visible somewhere in this screen now (the
          // status-tab filter, not this list, decides what's shown) --
          // just replace the row in place; the active statusFilter
          // naturally hides it if it no longer matches, instead of
          // this callback special-casing status transitions.
          setDeals((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
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

  const statusScoped = deals.filter((d) => statusFilter === 'all' || d.status === statusFilter);

  const filtered = statusScoped
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

  // Computed against the tab-filtered set, not the full deals array --
  // "12 needs review · 3 not yet reviewed" while sitting on the
  // Approved tab would read as nonsense otherwise.
  const unreviewedCount = statusScoped.filter((d) => d.pricing_reviewed_at === null).length;

  const STATUS_LABELS: Record<CuratedDeal['status'], string> = {
    pending: 'Needs review',
    approved: 'Approved',
    rejected: 'Rejected',
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.devBanner}>
          <Text style={styles.devBannerText}>DEV ONLY -- pricing review, no login</Text>
        </View>
        <Text style={styles.title}>Deal Pricing Review</Text>
        <Text style={styles.subtitle}>
          {statusScoped.length} deal{statusScoped.length === 1 ? '' : 's'} · {unreviewedCount} not yet reviewed
        </Text>

        <SegmentedControl options={STATUS_FILTER_OPTIONS} value={statusFilter} onChange={setStatusFilter} />

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
                {/* Redundant once a specific status tab is active (the
                    tab already says it) -- only shown on "All", where
                    rows of every status are mixed together. */}
                {statusFilter === 'all' && (
                  <View
                    style={[
                      styles.statusBadge,
                      deal.status === 'approved' && styles.statusBadgeApproved,
                      deal.status === 'rejected' && styles.statusBadgeRejected,
                    ]}
                  >
                    <Text style={styles.statusBadgeText}>{STATUS_LABELS[deal.status]}</Text>
                  </View>
                )}
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
  const [usage, setUsage] = useState<DealUsage>(deal.usage as DealUsage);
  // Generic category tags (e.g. "chicken breast", "beans") checked by
  // refresh_recipe_deal_tags()'s keyword fallback pass when a recipe
  // ingredient's own name doesn't exactly match this deal's real flyer
  // name -- see 20260808040000_deal_keyword_matches.sql. Used to only
  // ever be set during the separate Airtable review pass; folded in
  // here now that that step is gone (Anabelle: "how can we make it
  // like prime raised without antibiotics boneless skinless chicken
  // breasts could match 'chicken breasts'"). keywordInput holds the
  // in-progress text before it's committed to a chip.
  const [keywordMatches, setKeywordMatches] = useState<string[]>(deal.keyword_matches ?? []);
  const [keywordInput, setKeywordInput] = useState('');
  function addKeyword() {
    const trimmed = keywordInput.trim();
    if (trimmed === '') return;
    setKeywordMatches((prev) => (prev.some((k) => k.toLowerCase() === trimmed.toLowerCase()) ? prev : [...prev, trimmed]));
    setKeywordInput('');
  }
  function removeKeyword(target: string) {
    setKeywordMatches((prev) => prev.filter((k) => k !== target));
  }
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

  // Package weight is always stored/sent in grams, but this field only
  // ever shows up when price_unit is lb/kg/100g (see the `priceUnit !==
  // 'package' && priceUnit !== 'each'` guard below) -- i.e. exactly when
  // someone has just told the form the PRICE is per lb. It's reasonable to
  // assume that also makes this field lb-aware, but it doesn't: price_unit
  // (how the price is denominated) and package_weight_g (how big the whole
  // labeled package is, for the "$X for the whole bag" badge) are separate
  // fields entirely. Rather than requiring everyone to do the lb->g
  // conversion by hand, accept a unit suffix here directly -- a bare
  // number is still grams (unchanged), but "5 lbs"/"5 lb"/"5 pounds" or
  // "2.3 kg" convert automatically. Anything else that doesn't parse
  // cleanly is a real error, not a silent truncation: parseFloat("5 lbs")
  // used to quietly become the number 5 (five GRAMS), discarding "lbs"
  // with no warning -- this is what actually triggered the
  // "too small to be real" backend error, not the lb price_unit selection.
  function parsePackageWeightGrams(raw: string): { grams: number | null } | { error: string } {
    const trimmed = raw.trim();
    if (trimmed === '') return { grams: null };

    const lbMatch = trimmed.match(/^([\d.]+)\s*(lbs?|pounds?)$/i);
    if (lbMatch) {
      const lbs = parseFloat(lbMatch[1]);
      if (Number.isNaN(lbs)) return { error: `Could not read "${raw}" as a weight.` };
      return { grams: Math.round(lbs * 453.592) };
    }

    const kgMatch = trimmed.match(/^([\d.]+)\s*kg$/i);
    if (kgMatch) {
      const kg = parseFloat(kgMatch[1]);
      if (Number.isNaN(kg)) return { error: `Could not read "${raw}" as a weight.` };
      return { grams: Math.round(kg * 1000) };
    }

    const gMatch = trimmed.match(/^([\d.]+)\s*g(?:rams?)?$/i);
    if (gMatch) {
      const g = parseFloat(gMatch[1]);
      if (Number.isNaN(g)) return { error: `Could not read "${raw}" as a weight.` };
      return { grams: g };
    }

    if (/^[\d.]+$/.test(trimmed)) {
      return { grams: parseFloat(trimmed) };
    }

    return {
      error: `Could not read "${raw}" as a package weight -- enter a number in grams, or add a unit (e.g. "900", "5 lbs", "2.3 kg").`,
    };
  }

  // Shared by both Save and Reject -- a reject action still saves
  // whatever price/quantity fields were filled in at the same time
  // (see the Edge Function's own comment), so both buttons go through
  // the same validation/body-building, differing only in the trailing
  // `reject` flag.
  function buildBody(): { body: Record<string, unknown> } | { error: string } {
    const trimmedName = itemName.trim();
    const priceNum = priceUnknown ? null : parseFloat(price);
    const originalPriceNum = originalPriceUnknown ? null : parseFloat(originalPrice);
    const weightResult = parsePackageWeightGrams(packageWeightG);
    if ('error' in weightResult) {
      return { error: weightResult.error };
    }
    const weightNum = weightResult.grams;

    if (trimmedName === '') {
      return { error: 'Item name cannot be blank.' };
    }
    if (priceNum !== null && (Number.isNaN(priceNum) || priceNum < 0)) {
      return { error: 'Price must be blank/unknown or a non-negative number.' };
    }
    if (originalPriceNum !== null && (Number.isNaN(originalPriceNum) || originalPriceNum < 0)) {
      return { error: 'Original price must be blank/unknown or a non-negative number.' };
    }
    if (weightNum !== null && weightNum <= 0) {
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
        usage,
        keyword_matches: keywordMatches,
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
      // supabase-js's own invoke() only populates `data` for a 2xx
      // response -- for a non-2xx one (a real validation error, e.g.
      // this function's own hand-written messages, or a Postgres
      // constraint violation like the package_weight_g sanity check)
      // `data` comes back null and invokeError.message is just its
      // generic "Edge Function returned a non-2xx status code" wrapper
      // text, not the actual body this function DOES send. Real bug,
      // caught live (Anabelle: "i keep getting this error" -- the
      // generic text told her nothing about why a genuinely small
      // package_weight_g got rejected). FunctionsHttpError exposes the
      // raw Response on .context -- read its real JSON body when
      // present, falling back to the generic text only if that itself
      // fails for some other reason.
      let message = data?.error ?? invokeError?.message ?? 'Save failed.';
      const context = (invokeError as { context?: Response } | undefined)?.context;
      if (context && typeof context.json === 'function') {
        try {
          const body = (await context.json()) as { error?: string };
          if (body?.error) message = body.error;
        } catch {
          // Body wasn't JSON (or already consumed) -- keep the fallback above.
        }
      }
      setSaveError(message);
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

        {/* Anabelle: "confusing... if in the deals we do have the original
            and discount price from the flyer but you also add the statcan
            reference. Only show the statcan reference when we dont have it
            from merchant" -- when the flyer already prints a real original
            price, that IS the comparison; a StatCan/produce/staple hint
            alongside it is redundant noise, not a second opinion worth
            seeing. Gated on the live "Unknown" checkbox (originalPriceUnknown),
            not the persisted deal.original_price, so typing in a real
            flyer price hides the hint immediately without needing to save
            first. */}
        {originalPriceUnknown && referencePrice && (
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
        {originalPriceUnknown && referencePriceChecked && !referencePrice && (
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

        <Text style={styles.fieldLabel}>Should recipe generation use this ingredient?</Text>
        <SegmentedControl options={USAGE_OPTIONS} value={usage} onChange={setUsage} />

        {/* Anabelle: "Chicken, Beans & Corny Things is missing 2 matched
            ingredients: chicken and beans... how can we make it like
            prime raised without antibiotics boneless skinless chicken
            breasts could match 'chicken breasts'". A recipe ingredient
            matches this deal if its exact name matches OR any keyword
            here has every word present in the ingredient's name (plural-
            tolerant) -- see refresh_recipe_deal_tags()'s keyword
            fallback pass. Keep keywords generic/category-level (e.g.
            "chicken breast", "beans"), not the deal's own brand name --
            that's what lets differently-branded deals across future
            weeks all share the same keyword. */}
        <Text style={styles.fieldLabel}>Keywords for recipe matching (e.g. "chicken breast", "beans")</Text>
        <View style={styles.keywordRow}>
          <View style={styles.keywordInputWrap}>
            <InputField
              value={keywordInput}
              onChangeText={setKeywordInput}
              placeholder="Add a keyword"
              onSubmitEditing={addKeyword}
              returnKeyType="done"
            />
          </View>
          <Pressable style={styles.addKeywordButton} onPress={addKeyword}>
            <Text style={styles.addKeywordButtonText}>Add</Text>
          </Pressable>
        </View>
        {keywordMatches.length > 0 && (
          <View style={styles.keywordChipsRow}>
            {keywordMatches.map((keyword) => (
              <Pressable key={keyword} style={styles.keywordChip} onPress={() => removeKeyword(keyword)}>
                <Text style={styles.keywordChipText}>{keyword}</Text>
                <Text style={styles.keywordChipRemove}>✕</Text>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={styles.fieldLabel}>What is the price denominated in?</Text>
        <SegmentedControl options={PRICE_UNIT_OPTIONS} value={priceUnit} onChange={setPriceUnit} />

        {priceUnit !== 'package' && priceUnit !== 'each' && (
          <>
            <Text style={styles.fieldLabel}>
              How big is the whole package? Leave blank if genuinely bulk/loose. This is separate from the price unit
              above -- grams by default, or type lb/kg directly (e.g. "5 lbs").
            </Text>
            <InputField
              value={packageWeightG}
              onChangeText={setPackageWeightG}
              keyboardType="default"
              placeholder='e.g. 900 or "5 lbs"'
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
  // Amber (pending) is the default look; approved/rejected override the
  // background below. Only shown on the "All" status tab.
  statusBadge: { backgroundColor: '#FFA955', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  statusBadgeApproved: { backgroundColor: '#96E696' },
  statusBadgeRejected: { backgroundColor: '#F4A6A0' },
  statusBadgeText: { fontSize: 11, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
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
  keywordRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  keywordInputWrap: { flex: 1 },
  addKeywordButton: {
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 18,
    backgroundColor: '#fff',
  },
  addKeywordButtonText: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  keywordChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  keywordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F2F2F2',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  keywordChipText: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  keywordChipRemove: { fontSize: 12, color: '#767676' },
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
