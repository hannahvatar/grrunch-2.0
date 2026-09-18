import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CheckIcon, ChevronDownIcon } from 'react-native-heroicons/outline';

import { InputField } from '../components/InputField';
import { SegmentedControl } from '../components/SegmentedControl';
import { isGreatReferenceValue } from '../lib/curatedDeals';
import { sizeFromItemName, splitMultiItemName } from '../lib/dealNames';
import {
  benchmarkCostForQuantity,
  compare,
  formatMoney,
  IMPLAUSIBLE_BENCHMARK_RATIO,
  isImplausibleBenchmark,
  splitReferenceUnit,
} from '../lib/referenceCompare';
import {
  fetchStatcanPrices,
  rankReferenceCandidates,
  searchReferenceCandidates,
  type StaplePrice,
} from '../lib/staplePrices';
import { supabase } from '../lib/supabase';
import type { Database, Tables } from '../types/database';

const INK = '#111';

type CuratedDeal = Tables<'curated_deals'>;
type PriceUnit = Database['public']['Enums']['deal_price_unit'];
// See supabase/migrations/20260812000000_curated_deals_original_price_source.sql
// -- 'flyer' means original_price is a real price the store printed;
// 'reference' means it's a StatCan/human-researched comparison price WE
// derived, never printed anywhere. The live app never shows a
// 'reference' one as a strikethrough "was $X" -- see lib/curatedDeals.ts.
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
  { value: 'deals', label: 'Deals section only' },
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

// Sentinel for the zone filter's "untagged" bucket -- can't use null as a
// SegmentedControl value (it's typed <T extends string>).
const NO_ZONE = '__no_zone__';

// The unit half of "Price is per [quantity] [unit]" on the item page.
type PerUnit = 'g' | 'kg' | 'lb' | 'each';
const PER_UNIT_OPTIONS: { value: PerUnit; label: string }[] = [
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
  { value: 'lb', label: 'lb' },
  { value: 'each', label: 'each' },
];
const GRAMS_PER_LB = 453.592;

// "per 1 lb" / "per 1 kg" are rates (price_unit lb/kg); any other amount
// ("per 665 g", "per 5 lb") is a whole package of that weight (price_unit
// package + package_weight_g). A blank amount in grams is a package of
// unknown size.
function toStoredPrice(qty: number | null, unit: PerUnit): { priceUnit: PriceUnit; weightG: number | null } {
  if (unit === 'each') return { priceUnit: 'each', weightG: null };
  if (unit === 'lb') {
    return qty === null || qty === 1 ? { priceUnit: 'lb', weightG: null } : { priceUnit: 'package', weightG: Math.round(qty * GRAMS_PER_LB) };
  }
  if (unit === 'kg') {
    return qty === null || qty === 1 ? { priceUnit: 'kg', weightG: null } : { priceUnit: 'package', weightG: Math.round(qty * 1000) };
  }
  return { priceUnit: 'package', weightG: qty === null ? null : Math.round(qty) };
}

// The stored pair, back as what the "Price is per" row shows. A package
// with no stored size starts from the size on the flyer name (the largest
// one, for a range) as a real value, not a placeholder -- Anabelle: "why
// i still see 'package' when i manually input the gr and quantity". A
// grey placeholder "665" looked filled in while the price line and the
// saved row still said "package".
function fromStoredPrice(deal: CuratedDeal, itemName: string): { qty: string; unit: PerUnit } {
  if (deal.price_unit === 'lb') return { qty: '1', unit: 'lb' };
  if (deal.price_unit === 'kg') return { qty: '1', unit: 'kg' };
  if (deal.price_unit === '100g') return { qty: '100', unit: 'g' };
  if (deal.price_unit === 'each') return { qty: '', unit: 'each' };
  if (deal.package_weight_g != null) return { qty: String(deal.package_weight_g), unit: 'g' };
  const fromName = priceBasis('package', deal, itemName, null);
  if (fromName.unit === 'g') return { qty: fromName.quantity, unit: 'g' };
  // In grams even for "1 KG" -- "per 1 kg" would save as a per-kg rate,
  // not a 1 kg package (see toStoredPrice).
  if (fromName.unit === 'kg') return { qty: String(Math.round(parseFloat(fromName.quantity) * 1000)), unit: 'g' };
  return { qty: '', unit: 'g' };
}

// One card per flyer CUTOUT, not per curated_deals row -- Anabelle:
// "ok let's do one card per cutout but then it means inside the card i
// may have more than one product to review". Replaces the old per-
// product chips (ported from dev-cost.tsx), which showed a multi-item
// cutout as several look-alike cards, one of them a dashed, untappable
// "· needs split" placeholder you had to fix from a DIFFERENT card.
//
// Rows split off one cutout (duplicate-curated-deal copies every field,
// image_url included) share the same photo, and different cutouts never
// do (checked against live data: 243 rows -> 220 cutouts, 12 with more
// than one row) -- so chain + image_url is the cutout's identity. A row
// with no photo is always its own cutout.
interface Cutout {
  key: string;
  // Oldest first -- the original synced row, then any split-off copies.
  deals: CuratedDeal[];
  // Products a still-combined name lists (per splitMultiItemName,
  // lib/dealNames.ts) that don't have a row of their own in this cutout
  // yet -- each offered as "Add as its own deal" on the cutout screen.
  // `source` is the combined row that product would be copied from.
  missingParts: { part: string; source: CuratedDeal }[];
}

function cutoutKeyFor(deal: CuratedDeal): string {
  return deal.image_url ? `${deal.chain_name}|${deal.image_url}` : deal.id;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function isCombinedName(name: string): boolean {
  return splitMultiItemName(name).length > 1;
}

function buildCutouts(deals: CuratedDeal[]): Map<string, Cutout> {
  const byKey = new Map<string, CuratedDeal[]>();
  for (const deal of deals) {
    const key = cutoutKeyFor(deal);
    const list = byKey.get(key);
    if (list) list.push(deal);
    else byKey.set(key, [deal]);
  }

  const cutouts = new Map<string, Cutout>();
  for (const [key, list] of byKey) {
    const sorted = list.slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    // Case-insensitive -- a split-off row renamed "Organic Green grapes"
    // still claims the flyer's "Organic Green Grapes".
    const claimed = new Set(sorted.map((d) => normalizeName(d.item_name)));
    const missingParts: Cutout['missingParts'] = [];
    for (const deal of sorted) {
      const parts = splitMultiItemName(deal.item_name);
      if (parts.length < 2) continue;
      for (const part of parts) {
        if (claimed.has(normalizeName(part))) continue;
        claimed.add(normalizeName(part));
        missingParts.push({ part, source: deal });
      }
    }
    cutouts.set(key, { key, deals: sorted, missingParts });
  }
  return cutouts;
}

// What a cutout's list card calls itself: the flyer's own combined text
// when a row still carries it (that IS the cutout's name), otherwise
// each split-off product's name joined together.
function cutoutTitle(cutout: Cutout): string {
  if (cutout.deals.length === 1) return cutout.deals[0].item_name;
  const combined = cutout.deals.find((d) => isCombinedName(d.item_name));
  return combined ? combined.item_name : cutout.deals.map((d) => d.item_name).join(' · ');
}

const STATUS_LABELS: Record<CuratedDeal['status'], string> = {
  pending: 'Needs review',
  approved: 'Approved',
  rejected: 'Rejected',
};

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  // 'all' (default) shows every row regardless of zone. Anabelle,
  // 2026-09-14: "Can Airtable show the deals in their different zone for
  // me to approve instead?" -- this is that, for her own weekly review
  // (curated_deals.zone is never shown to shoppers anywhere -- see
  // lib/dealZones.ts's filterDealsByZone, which only ever hides a deal,
  // never labels it).
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Set only when the open row was reached via a still-combined
  // multi-item chip -- prefills DealEditView's item name with the
  // specific product that chip represents (e.g. "Hot Pepper Rings,
  // 750 mL") instead of the raw, all-products-joined stored name, so
  // renaming to match doesn't require retyping/copying it by hand.
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  // The cutout screen currently open (only for a cutout with more than
  // one product to review) -- a deal opened FROM it returns here on
  // back/save instead of all the way to the list.
  const [selectedCutoutKey, setSelectedCutoutKey] = useState<string | null>(null);

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

  const cutouts = buildCutouts(deals);
  const selectedDeal = deals.find((d) => d.id === selectedId) ?? null;
  const selectedCutout = selectedCutoutKey ? (cutouts.get(selectedCutoutKey) ?? null) : null;

  if (selectedDeal) {
    const closeDeal = () => {
      // Back to the cutout screen when the deal was opened from one
      // (selectedCutoutKey stays set), otherwise back to the list.
      setSelectedId(null);
      setSelectedLabel(null);
    };
    return (
      <DealEditView
        key={selectedDeal.id}
        deal={selectedDeal}
        initialItemName={selectedLabel ?? undefined}
        backLabel={selectedCutout ? '← Back to cutout' : '← Back to list'}
        onBack={closeDeal}
        onSaved={(updated) => {
          // Every status is visible somewhere in this screen now (the
          // status-tab filter, not this list, decides what's shown) --
          // just replace the row in place; the active statusFilter
          // naturally hides it if it no longer matches.
          setDeals((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
          closeDeal();
        }}
      />
    );
  }

  if (selectedCutout) {
    return (
      <CutoutView
        cutout={selectedCutout}
        onBack={() => setSelectedCutoutKey(null)}
        onOpenDeal={(deal) => setSelectedId(deal.id)}
        onSplitOff={(source, duplicate, part) => {
          // The copy arrives already named after this one product
          // (duplicate-curated-deal's item_name) -- open it straight away
          // for review. Only if it didn't (that function not yet
          // redeployed) does the product name ride along as the name to
          // save with the form.
          setDeals((prev) => [...prev.map((d) => (d.id === source.id ? source : d)), duplicate]);
          setSelectedId(duplicate.id);
          setSelectedLabel(duplicate.item_name === part ? null : part);
        }}
      />
    );
  }

  const statusScoped = deals.filter((d) => statusFilter === 'all' || d.status === statusFilter);

  // Options are built from whatever zones actually appear across every
  // loaded deal, not a hardcoded list -- stays correct as more deals get
  // tagged (or as ZONES_BY_CHAIN in lib/dealZones.ts grows) with no edits
  // needed here. Deliberately not scoped to the current status tab: the
  // dropdown is always shown now (Anabelle: "the zone dropdown should
  // always be shown"), so its choices shouldn't shift or empty out just
  // from switching tabs.
  const presentZones = Array.from(
    new Set(deals.map((d) => d.zone).filter((z): z is string => z !== null))
  ).sort();
  const zoneOptions: { value: string; label: string }[] = [
    { value: 'all', label: 'All zones' },
    ...presentZones.map((z) => ({ value: z, label: z })),
    { value: NO_ZONE, label: 'No zone tag' },
  ];

  // No separate "only show not-yet-reviewed" checkbox any more --
  // Anabelle: "its redundant with the chip". The "Needs review" status
  // tab is the one place that narrows to the work queue.
  const q = search.trim().toLowerCase();
  const matchesFilters = (d: CuratedDeal) =>
    (statusFilter === 'all' || d.status === statusFilter) &&
    (zoneFilter === 'all' || (zoneFilter === NO_ZONE ? d.zone === null : d.zone === zoneFilter)) &&
    (!q || d.item_name.toLowerCase().includes(q) || d.chain_name.toLowerCase().includes(q));

  // A cutout shows when ANY of its deals matches the tab/zone/search --
  // it's opened as a whole, so its other products (whatever their
  // status) stay visible as context on the cutout screen.
  const visibleCutouts = Array.from(cutouts.values())
    .filter((c) => c.deals.some(matchesFilters))
    // Unreviewed-first (alphabetical within that group -- browsing an
    // untouched queue, alphabetical is as good an order as any). Already-
    // reviewed cutouts sort most-recent-decision-first instead: "i
    // approved unico olives 3 times its still there" (dev-cost.tsx,
    // ported in with its merge) -- being able to jump straight back to
    // the thing you just got wrong, with no separate queue/tab for it.
    .map((c) => {
      const unreviewed = c.deals.some((d) => d.pricing_reviewed_at === null);
      const lastReviewed = Math.max(
        ...c.deals.map((d) => (d.pricing_reviewed_at ? new Date(d.pricing_reviewed_at).getTime() : 0))
      );
      return { cutout: c, title: cutoutTitle(c), unreviewed, lastReviewed };
    })
    .sort((a, b) => {
      if (a.unreviewed !== b.unreviewed) return a.unreviewed ? -1 : 1;
      if (a.unreviewed) return a.title.localeCompare(b.title);
      return b.lastReviewed - a.lastReviewed;
    });

  // Computed against the tab-filtered set, not the full deals array --
  // "12 needs review · 3 not yet reviewed" while sitting on the
  // Approved tab would read as nonsense otherwise.
  const unreviewedCount = statusScoped.filter((d) => d.pricing_reviewed_at === null).length;

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

        <SegmentedControl wrap options={STATUS_FILTER_OPTIONS} value={statusFilter} onChange={setStatusFilter} />

        {/* Anabelle: "it should be on the same row as the search on its
            right side". zIndex lives on this row (not just the Dropdown
            inside it) since it's the row that's the sibling of the deal
            rows the open menu overlaps -- see Dropdown's own comment. */}
        <View style={styles.searchRow}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by item or store..."
            placeholderTextColor="#999"
            style={[styles.searchInput, styles.searchInputFlex]}
          />
          <Dropdown options={zoneOptions} value={zoneFilter} onChange={setZoneFilter} menuAlign="right" />
        </View>

        {visibleCutouts.map(({ cutout, title, unreviewed }) => {
          const single = cutout.deals.length === 1 && cutout.missingParts.length === 0;
          const deal = cutout.deals[0];
          return (
            <Pressable
              key={cutout.key}
              style={styles.dealRow}
              onPress={() => {
                // A plain one-product cutout has nothing to choose
                // between -- straight to its edit form, like before.
                if (single) setSelectedId(deal.id);
                else setSelectedCutoutKey(cutout.key);
              }}
            >
              {deal.image_url ? (
                <Image source={{ uri: deal.image_url }} style={styles.dealThumb} resizeMode="cover" />
              ) : (
                <View style={styles.dealThumb} />
              )}
              <View style={styles.dealRowInfo}>
                <Text style={styles.dealRowName} numberOfLines={2}>
                  {title}
                </Text>
                <Text style={styles.dealRowStore}>{deal.chain_name}</Text>
                {single ? (
                  <DealPriceLine deal={deal} showStatus={statusFilter === 'all'} />
                ) : (
                  <View style={styles.dealRowPriceLine}>
                    <View style={styles.productCountBadge}>
                      <Text style={styles.productCountBadgeText}>
                        {cutout.deals.length} deal{cutout.deals.length === 1 ? '' : 's'}
                      </Text>
                    </View>
                    {cutout.missingParts.length > 0 && (
                      <View style={styles.unreviewedBadge}>
                        <Text style={styles.unreviewedBadgeText}>{cutout.missingParts.length} not split yet</Text>
                      </View>
                    )}
                    {unreviewed && (
                      <View style={styles.unreviewedBadge}>
                        <Text style={styles.unreviewedBadgeText}>Not reviewed</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}

        {visibleCutouts.length === 0 && <Text style={styles.emptyText}>No deals match.</Text>}
      </ScrollView>
    </View>
  );
}

// Price, original price, unit, zone and review badges for one deal --
// shared by the list's one-product cards and the cutout screen's rows.
function DealPriceLine({ deal, showStatus }: { deal: CuratedDeal; showStatus: boolean }) {
  return (
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
      {/* Not shown when untagged -- most rows still are, and an
          empty/"No zone" badge on every single row would be more noise
          than signal. The zone filter already covers "show me the
          untagged ones". */}
      {deal.zone && (
        <View style={styles.zoneBadge}>
          <Text style={styles.zoneBadgeText}>{deal.zone}</Text>
        </View>
      )}
      {showStatus && (
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
  );
}

interface CutoutViewProps {
  cutout: Cutout;
  onBack: () => void;
  onOpenDeal: (deal: CuratedDeal) => void;
  onSplitOff: (source: CuratedDeal, duplicate: CuratedDeal, part: string) => void;
}

// One flyer cutout with more than one product on it: the photo once,
// then every deal already made from it (each reviewed on its own, like
// Airtable's setup -- "You need to duplicate the cutout and have me
// review the items individually"), then any product it lists that
// doesn't have a deal yet. Replaces the old "Split into N separate
// items" button inside the edit form, which made N anonymous copies
// all still carrying the combined name for you to tell apart later.
function CutoutView({ cutout, onBack, onOpenDeal, onSplitOff }: CutoutViewProps) {
  const [splittingPart, setSplittingPart] = useState<string | null>(null);
  const [splitError, setSplitError] = useState<string | null>(null);
  const photo = cutout.deals.find((d) => d.image_url)?.image_url ?? null;

  async function splitOff(part: string, source: CuratedDeal) {
    setSplitError(null);
    setSplittingPart(part);
    const { data, error: invokeError } = await supabase.functions.invoke<{
      source?: CuratedDeal;
      duplicate?: CuratedDeal;
      error?: string;
    }>('duplicate-curated-deal', { body: { deal_id: source.id, item_name: part } });
    setSplittingPart(null);
    if (invokeError || !data?.source || !data?.duplicate) {
      setSplitError(data?.error ?? invokeError?.message ?? 'Could not add this product as its own deal.');
      return;
    }
    onSplitOff(data.source, data.duplicate, part);
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.backLink}>← Back to list</Text>
        </Pressable>

        {photo && <Image source={{ uri: photo }} style={styles.editPhoto} resizeMode="contain" />}
        <Text style={styles.cutoutTitle}>{cutoutTitle(cutout)}</Text>
        <Text style={styles.editStore}>{cutout.deals[0].chain_name}</Text>

        <Text style={styles.sectionTitle}>Deals from this cutout</Text>
        {cutout.deals.map((deal) => {
          const combined = isCombinedName(deal.item_name);
          return (
            <Pressable key={deal.id} style={styles.dealRow} onPress={() => onOpenDeal(deal)}>
              <View style={styles.dealRowInfo}>
                <Text style={styles.dealRowName}>{deal.item_name}</Text>
                <DealPriceLine deal={deal} showStatus />
                {/* A row still carrying the flyer's combined "X or Y"
                    name once every product has its own deal is a
                    leftover (e.g. the live "Prepared In-Store Cooked or
                    Raw Shrimp Grillers") -- it double-counts the deal
                    while approved. */}
                {combined && deal.status !== 'rejected' && (
                  <Text style={styles.cutoutHint}>
                    {cutout.missingParts.length === 0
                      ? 'Every product on this cutout has its own deal now -- open this combined one and Reject it.'
                      : 'Still lists several products -- add each one as its own deal below.'}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })}

        {cutout.missingParts.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Not split yet</Text>
            {cutout.missingParts.map(({ part, source }) => (
              <View key={part} style={[styles.dealRow, styles.missingPartRow]}>
                <Text style={[styles.dealRowName, styles.missingPartName]}>{part}</Text>
                <Pressable
                  style={[styles.splitButton, splittingPart !== null && styles.saveButtonDisabled]}
                  onPress={() => splitOff(part, source)}
                  disabled={splittingPart !== null}
                >
                  {splittingPart === part ? (
                    <ActivityIndicator color="#3B82F6" />
                  ) : (
                    <Text style={styles.splitButtonText}>Add as its own deal</Text>
                  )}
                </Pressable>
              </View>
            ))}
            {splitError && <Text style={styles.saveError}>{splitError}</Text>}
          </>
        )}
      </ScrollView>
    </View>
  );
}

interface DropdownProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  // Which edge the open menu lines up with -- 'right' when the pill sits
  // at the right edge of the screen, so the menu doesn't run off it.
  menuAlign?: 'left' | 'right';
}

// Anabelle: "The zones chips should be in a dropdown as all these chips
// for me is confusing" -- a single pill showing the current choice,
// opening a menu, instead of a SegmentedControl row that scrolls off
// screen once a chain has several zones. Same pill/menu look as the
// Meals tab's sort dropdown (app/(tabs)/meals.tsx). The root View's
// zIndex is load-bearing on web (see that file's headerRow comment):
// it has to sit on the element that's a sibling of what the open menu
// overlaps, or the menu paints underneath the rows below it.
function Dropdown({ options, value, onChange, menuAlign = 'left' }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View style={styles.dropdown}>
      <Pressable style={styles.dropdownPill} onPress={() => setOpen((v) => !v)}>
        <Text style={styles.dropdownPillText}>{selected?.label ?? 'Choose...'}</Text>
        <ChevronDownIcon size={16} color={INK} strokeWidth={2} />
      </Pressable>
      {open && (
        <View style={[styles.dropdownMenu, menuAlign === 'right' ? styles.dropdownMenuRight : styles.dropdownMenuLeft]}>
          {options.map((option) => (
            <Pressable
              key={option.value}
              style={styles.dropdownMenuItem}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <Text style={styles.dropdownMenuItemText}>{option.label}</Text>
              {option.value === value && <CheckIcon size={16} color={INK} strokeWidth={2} />}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

interface DealEditViewProps {
  deal: CuratedDeal;
  // The specific product name to save, when this deal was just split off
  // a multi-product cutout and still carries the combined flyer name
  // (only happens with a copy made before duplicate-curated-deal learned
  // to name copies itself). undefined means "use deal.item_name as-is".
  initialItemName?: string;
  // "← Back to cutout" when opened from a cutout screen, so it's clear
  // where back goes.
  backLabel: string;
  onBack: () => void;
  onSaved: (deal: CuratedDeal) => void;
}

// What a price is FOR, as the quantity/unit pair lib/referenceCompare.ts
// normalizes against, plus how to say it after a "$X / ". A lb/kg/100g
// price is a RATE, so the comparable quantity is one of that rate's own
// units and package size is deliberately ignored (pairing a per-lb price
// with a 700 g package would read as a far better deal than it is). A
// package price is the whole flat price, so its size -- stored, or read
// off the flyer name as a last resort -- is the honest quantity.
function priceBasis(
  unit: PriceUnit,
  deal: CuratedDeal,
  itemName: string,
  // The package size in grams as currently entered in "Fix it" (starts
  // as the stored package_weight_g) -- wins over anything read off the
  // name.
  packageWeightG: number | null
): { quantity: string; unit: string; label: string; sizeNote?: string } {
  if (unit === 'lb') return { quantity: '1', unit: 'lb', label: 'lb' };
  if (unit === 'kg') return { quantity: '1', unit: 'kg', label: 'kg' };
  if (unit === '100g') return { quantity: '100', unit: 'g', label: '100 g' };
  if (unit === 'each') return { quantity: '1', unit: 'ea', label: 'each' };
  if (packageWeightG) {
    return { quantity: String(packageWeightG), unit: 'g', label: `${packageWeightG} g` };
  }
  if (deal.package_volume_ml) {
    return { quantity: String(deal.package_volume_ml), unit: 'ml', label: `package (${deal.package_volume_ml} ml)` };
  }
  // Read off the flyer name as a last resort, labelled plain "package"
  // (the title already shows the cutout's own size text). For a size
  // RANGE the LARGEST size is used -- Anabelle: "when the cutout offers a
  // range e.g. 584 gr to 665 gr, I will always pick the upper number".
  // That makes the saved percentage a best case, which is why every
  // shopper-facing badge says "Up to" (lib/curatedDeals.ts's
  // formatRealDiscountLabel / formatGreatReferenceValueLabel). sizeNote
  // says which size was used, next to the conversion.
  const range = itemName.match(RANGE_SIZE);
  if (range) {
    const rangeUnit = RANGE_UNITS[range[3].toLowerCase()];
    if (rangeUnit) {
      return {
        quantity: range[2],
        unit: rangeUnit,
        label: 'package',
        sizeNote: `${range[2]} ${rangeUnit}, largest size on the cutout`,
      };
    }
  }
  const size = sizeFromItemName(itemName);
  if (size) return { quantity: size.quantity, unit: size.unit, label: 'package', sizeNote: `${size.quantity} ${size.unit}` };
  return { quantity: '1', unit: 'ea', label: 'package' };
}

// "584-665 G", "150/220 g", "295 – 411 g" -- a flyer cutout covering
// several package sizes at one price.
const RANGE_SIZE = /(\d+(?:\.\d+)?)\s*[-–/]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/i;
const RANGE_UNITS: Record<string, string> = { kg: 'kg', g: 'g', ml: 'ml', l: 'L' };

type ConvertedReference =
  | {
      ok: true;
      value: number;
      pctVsReference: number;
      implausible: boolean;
      // Both prices restated on the same basis (per 100 g / 100 ml / each)
      // -- the "normalized" row of the comparison table.
      cutoutPerBasis: number;
      referencePerBasis: number;
      basisLabel: string;
      // What the cutout price is for, as compared: "665 g", "1 lb", "each".
      cutoutQuantityLabel: string;
    }
  | { ok: false; reason: string };

const BASIS_LABELS: Record<string, string> = { '100g': '100 g', '100ml': '100 ml', ea: 'each' };

// A reference price restated for the SAME quantity the cutout price is
// for -- e.g. StatCan's "$18.39 per kilogram" becomes $8.34 for a
// per-lb deal. Anabelle: "Convert so the unit are matching e.g. here the
// price is per lbs so show the conversion if needed." Same engine
// (compare + benchmarkCostForQuantity) the app's own pricing uses, so
// the number saved as original_price is exactly what's shown here.
function convertReference(
  dealPrice: number,
  priceUnit: PriceUnit,
  basis: { quantity: string; unit: string },
  reference: { price: number; unit: string }
): ConvertedReference {
  const referenceUnit = splitReferenceUnit(reference.unit);
  // A reference priced per package/item ("Red Baron pizza $2.97 / 1
  // package") compares straight against a per-package or per-item deal,
  // one for one -- never via the package's weight, which would be a
  // weight-vs-count mismatch compare() rightly refuses.
  const compareBasis =
    referenceUnit.unit === 'ea' && (priceUnit === 'package' || priceUnit === 'each')
      ? { quantity: '1', unit: 'ea' }
      : basis;
  const outcome = compare(dealPrice, compareBasis.quantity, compareBasis.unit, {
    kind: 'reference',
    price: reference.price,
    ...referenceUnit,
  });
  if (!outcome.ok) return outcome;
  const value = benchmarkCostForQuantity(outcome.comparison, compareBasis.quantity, compareBasis.unit);
  if (value === undefined) return { ok: false, reason: "Couldn't convert this reference to the cutout's unit." };
  return {
    ok: true,
    value,
    pctVsReference: outcome.comparison.differencePct,
    // See isImplausibleBenchmark's doc comment -- 5x+ off is a unit
    // mix-up, never a real deal, so it can't be approved as-is.
    implausible: isImplausibleBenchmark(outcome.comparison),
    cutoutPerBasis: outcome.comparison.itemPerBasis,
    referencePerBasis: outcome.comparison.benchmarkPerBasis,
    basisLabel: BASIS_LABELS[outcome.comparison.basisLabel] ?? outcome.comparison.basisLabel,
    cutoutQuantityLabel:
      compareBasis.unit === 'ea'
        ? compareBasis.quantity === '1'
          ? 'each'
          : `${compareBasis.quantity} ea`
        : `${compareBasis.quantity} ${compareBasis.unit}`,
  };
}

// The reference shown for approval: a StatCan item (matched or searched),
// or an AI estimate (aiReasoning set) when StatCan has nothing comparable.
type ShownReference = { name: string; avgPrice: number; unit: string; aiReasoning?: string };

// supabase-js's invoke() only fills `data` on a 2xx -- for a non-2xx the
// real message is in the Response on the error's .context (see submit()).
async function functionErrorMessage(
  invokeError: unknown,
  dataError: string | undefined,
  fallback: string
): Promise<string> {
  let message = dataError ?? (invokeError as { message?: string } | null)?.message ?? fallback;
  const context = (invokeError as { context?: Response } | null)?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // Body wasn't JSON (or already consumed) -- keep the fallback above.
    }
  }
  return message;
}

// Whether the StatCan reference on screen has been approved or rejected
// yet. Undecided leaves whatever reference price is already saved alone.
type ReferenceDecision = 'undecided' | 'approved' | 'rejected';

// Internal-only pricing review for one deal. Laid out in the order
// Anabelle reviews a deal in (2026-09-18):
//   1. the cutout's price per quantity, e.g. "$8.99 / lb"
//   2. the cutout's previous price, when it prints one
//   3. otherwise, a StatCan reference price converted to the same unit
//   4. approve that reference -- or reject it and search StatCan for
//      the right item ("here would be frozen pizza")
//   5. whether recipes may use this deal (or it's Deals-section only)
//   6. reject the deal altogether, or save it
// Only two kinds of comparison exist (Anabelle: "there should only be 2
// options for reference price"): the cutout's own previous price, or
// StatCan -- the produce/staple tables and hand-typed references are no
// longer offered here.
// Everything else the old long form asked (package size and its source,
// "quantity is an estimate", zone picker, price-source picker) is gone
// from the screen -- whatever is already stored for those is sent back
// unchanged on save.
function DealEditView({ deal, initialItemName, backLabel, onBack, onSaved }: DealEditViewProps) {
  // Anabelle: "The name should be fetched from the cutout and displayed
  // as is" -- a title, never an input.
  const itemName = initialItemName ?? deal.item_name;

  // 1 -- Cutout price. Shown as text; the fields only open behind "Fix
  // it" (or straight away when no price was captured at all).
  const [fixingPrice, setFixingPrice] = useState(deal.price === null);
  const [priceText, setPriceText] = useState(deal.price != null ? String(deal.price) : '');
  // "Price is per [quantity] [unit]" -- Anabelle: "Price on the cutout:
  // 4 / Price is per gr / Input: 665gr". Mapped onto the stored
  // price_unit + package_weight_g pair by toStoredPrice below.
  const initialPer = fromStoredPrice(deal, itemName);
  const [perQtyText, setPerQtyText] = useState(initialPer.qty);
  const [perUnit, setPerUnit] = useState<PerUnit>(initialPer.unit);

  // 2 -- The cutout's own previous price, when it prints one. Only a
  // 'flyer'-sourced original price counts -- a 'reference' one is ours.
  const [previousText, setPreviousText] = useState(
    deal.original_price != null && deal.original_price_source === 'flyer' ? String(deal.original_price) : ''
  );

  // 3/4 -- StatCan reference.
  const [decision, setDecision] = useState<ReferenceDecision>('undecided');
  const [statcan, setStatcan] = useState<StaplePrice[] | null>(null);
  const [statcanError, setStatcanError] = useState(false);
  // A StatCan item picked by hand from search, replacing the automatic
  // match when that one searched the wrong word.
  const [pickedReference, setPickedReference] = useState<ShownReference | null>(null);
  // What the AI is asked to price -- starts as the deal's own name, but
  // editable (Anabelle: "Any ways I could input myself the exact wording
  // of the item to AI estimate?").
  const [aiQuery, setAiQuery] = useState(itemName);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Anabelle: "If statcan doesnt have a reference i think i want to be able
  // to input an ai one" -- asks Claude (estimate-reference-price) for this
  // item's average retail price in BC, StatCan-style. The result is
  // approved or rejected exactly like a StatCan item, and saved the same
  // way once approved.
  async function getAiEstimate() {
    const query = aiQuery.trim();
    if (query === '') {
      setAiError('Enter the item to estimate.');
      return;
    }
    setAiError(null);
    setAiLoading(true);
    // No store name -- the estimate is a BC-wide average like StatCan's,
    // not this store's shelf price (see the function's header comment).
    const { data, error: invokeError } = await supabase.functions.invoke<{
      price?: number;
      quantity?: number;
      unit?: string;
      reasoning?: string;
      error?: string;
    }>('estimate-reference-price', { body: { item_name: query } });
    setAiLoading(false);
    if (invokeError || !data?.price || !data.quantity || !data.unit) {
      setAiError(await functionErrorMessage(invokeError, data?.error, 'Could not get an AI estimate.'));
      return;
    }
    setPickedReference({
      name: query,
      avgPrice: data.price,
      // "each" -> "1 ea", which splitReferenceUnit reads as a count.
      unit: `${data.quantity} ${data.unit === 'each' ? 'ea' : data.unit}`,
      aiReasoning: data.reasoning,
    });
    setDecision('undecided');
    setSearchOpen(false);
    setSearchQuery('');
  }
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchStatcanPrices()
      .then(setStatcan)
      .catch(() => setStatcanError(true));
  }, []);

  // 5 -- Recipes or Deals section only.
  const [usage, setUsage] = useState<DealUsage>(deal.usage as DealUsage);
  // Generic category tags (e.g. "chicken breast", "beans") checked by
  // refresh_recipe_deal_tags()'s keyword fallback pass when a recipe
  // ingredient's own name doesn't exactly match this deal's real flyer
  // name -- see 20260808040000_deal_keyword_matches.sql (Anabelle: "how
  // can we make it like prime raised without antibiotics boneless
  // skinless chicken breasts could match 'chicken breasts'"). Only shown
  // under "Use in recipes", the only case they do anything.
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

  const parsedPrice = priceText.trim() === '' ? null : parseFloat(priceText);
  const priceNum = parsedPrice !== null && Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : null;
  const parsedPrevious = previousText.trim() === '' ? null : parseFloat(previousText);
  const previousNum =
    parsedPrevious !== null && Number.isFinite(parsedPrevious) && parsedPrevious > 0 ? parsedPrevious : null;
  const parsedQty = perQtyText.trim() === '' ? null : parseFloat(perQtyText);
  const perQty = parsedQty !== null && Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : null;
  const { priceUnit, weightG } = toStoredPrice(perQty, perUnit);
  const basis = priceBasis(priceUnit, deal, itemName, weightG);

  // The StatCan item shown for approval: one picked from search, else
  // the automatic match (the pick the app's own pricing engine would
  // make, else the best-ranked one).
  const autoMatches = statcan ? rankReferenceCandidates(itemName, statcan, [], []) : [];
  const autoMatch = autoMatches.find((c) => c.isEnginePick) ?? autoMatches[0] ?? null;
  const reference: ShownReference | null = pickedReference ?? autoMatch;
  const referenceLabel = reference?.aiReasoning !== undefined ? 'the AI estimate' : 'StatCan';
  const converted =
    reference && priceNum !== null
      ? convertReference(priceNum, priceUnit, basis, { price: reference.avgPrice, unit: reference.unit })
      : null;
  const canApprove = converted?.ok === true && !converted.implausible;
  // Search opens by itself when the match is rejected or nothing matched.
  const showSearch = searchOpen || decision === 'rejected' || (statcan !== null && !reference);
  const searchResults = statcan && showSearch ? searchReferenceCandidates(searchQuery, statcan, [], []) : [];

  // A reference price saved on an earlier review -- kept as-is unless a
  // StatCan reference is approved or rejected this time.
  const savedReference =
    deal.original_price != null && deal.original_price_source === 'reference' ? deal.original_price : null;

  // What original_price/original_price_source get saved as, from
  // whichever of steps 2-4 applies.
  function resolvedOriginal(): { value: number | null; source: OriginalPriceSource } {
    if (previousNum !== null) return { value: previousNum, source: 'flyer' };
    if (decision === 'approved' && converted?.ok && !converted.implausible) {
      return { value: converted.value, source: 'reference' };
    }
    if (decision === 'undecided' && savedReference !== null) return { value: savedReference, source: 'reference' };
    // Nothing to compare against -- saved as unknown (no deal badge).
    return { value: null, source: deal.original_price_source as OriginalPriceSource };
  }

  function buildBody(): { body: Record<string, unknown> } | { error: string } {
    if (priceText.trim() !== '' && priceNum === null) {
      return { error: 'The cutout price must be a positive number (or blank if unknown).' };
    }
    if (previousText.trim() !== '' && previousNum === null) {
      return { error: 'The previous price must be a positive number (or blank if the cutout shows none).' };
    }
    // Same floor as update-curated-deal-pricing's own check (and the
    // curated_deals_package_weight_g_sane constraint) -- no real package
    // weighs under 10 g, so that's always a wrong unit.
    if (perQtyText.trim() !== '' && perQty === null) {
      return { error: 'The quantity the price is for must be a positive number.' };
    }
    if (weightG !== null && weightG < 10) {
      return { error: 'That quantity is under 10 g -- no real package is that small, so check the unit.' };
    }
    const original = resolvedOriginal();
    return {
      body: {
        deal_id: deal.id,
        item_name: itemName,
        price: priceNum,
        original_price: original.value,
        original_price_source: original.source,
        price_unit: priceUnit,
        usage,
        keyword_matches: keywordMatches,
        // Only a per-package price uses a package size; for any other
        // unit the stored one is sent back untouched. A size typed here
        // was read off the cutout, hence 'label'.
        package_weight_g: priceUnit === 'package' ? weightG : deal.package_weight_g,
        package_weight_g_source:
          priceUnit !== 'package'
            ? deal.package_weight_g === null
              ? null
              : deal.package_weight_g_source
            : weightG === null
              ? null
              : weightG === deal.package_weight_g
                ? deal.package_weight_g_source
                : 'label',
        // No longer asked on this screen -- sent back exactly as stored.
        quantity_estimated: deal.quantity_estimated,
        zone: deal.zone,
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
      // Real bug, caught live (Anabelle: "i keep getting this error") --
      // the generic non-2xx text told her nothing; functionErrorMessage
      // reads the function's own message instead.
      setSaveError(await functionErrorMessage(invokeError, data?.error, 'Save failed.'));
      return;
    }
    onSaved(data.deal);
  }

  const handleSave = () => submit({});
  // "Not a good deal, or any [other reason]" -- a general-purpose
  // reject, no reason required. Sets status='rejected' server-side,
  // which immediately excludes it from refresh_recipe_deal_tags().
  const handleReject = () => submit({ reject: true });

  return (
    <View style={styles.container}>
      {/* "handled": tapping a StatCan search result picks it on the first
          tap, instead of the first tap only closing the keyboard. */}
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.backLink}>{backLabel}</Text>
        </Pressable>

        {deal.image_url && <Image source={{ uri: deal.image_url }} style={styles.editPhoto} resizeMode="contain" />}
        {/* Anabelle: "Make the name of the store underneath the cutout and
            in a black tag" -- and the zone "the same way", when the
            price only applies to one. Display only. */}
        <View style={styles.tagRow}>
          <View style={styles.storeTag}>
            <Text style={styles.storeTagText}>{deal.chain_name}</Text>
          </View>
          {deal.zone && (
            <View style={styles.storeTag}>
              <Text style={styles.storeTagText}>{deal.zone}</Text>
            </View>
          )}
        </View>

        <Text style={styles.nameTitle}>{itemName}</Text>

        {/* 1 -- Cutout price. Each step sits in its own white card
            (Anabelle: "Make the cutout price section in its own white
            container" / "StatCan reference section also"). */}
        <View style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, styles.sectionTitleInCard]}>Cutout price</Text>
          {!fixingPrice && (
            <>
              <Text style={styles.bigPrice}>
                {priceNum !== null ? `${formatMoney(priceNum)} / ${basis.label}` : 'No price saved'}
              </Text>
              {/* Tertiary treatment -- same white-fill/1.5px-INK pill as
                  signup-nudge.tsx's tertiaryButton, not a bare link. */}
              <Pressable style={styles.tertiaryButton} onPress={() => setFixingPrice(true)}>
                <Text style={styles.tertiaryButtonText}>Price is wrong? Fix it</Text>
              </Pressable>
            </>
          )}
          {fixingPrice && (
            <>
              <Text style={styles.fieldLabel}>Price on the cutout</Text>
              <InputField value={priceText} onChangeText={setPriceText} keyboardType="decimal-pad" placeholder="0.00" />
              <Text style={styles.fieldLabel}>Price is per</Text>
              <View style={styles.perRow}>
                {perUnit !== 'each' && (
                  <View style={styles.keywordInputWrap}>
                    <InputField
                      value={perQtyText}
                      onChangeText={setPerQtyText}
                      keyboardType="decimal-pad"
                      placeholder="1"
                    />
                  </View>
                )}
                <Dropdown
                  options={PER_UNIT_OPTIONS}
                  value={perUnit}
                  onChange={(value) => setPerUnit(value as PerUnit)}
                  menuAlign="right"
                />
              </View>
              <Text style={styles.fieldLabel}>Previous price on the cutout (leave blank if none)</Text>
              <InputField value={previousText} onChangeText={setPreviousText} keyboardType="decimal-pad" placeholder="0.00" />
              <Pressable style={styles.tertiaryButton} onPress={() => setFixingPrice(false)}>
                <Text style={styles.tertiaryButtonText}>Done</Text>
              </Pressable>
            </>
          )}
        </View>

        {/* 2 -- Previous price, only when the cutout prints one */}
        {!fixingPrice && previousNum !== null && (
          <View style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, styles.sectionTitleInCard]}>Previous price</Text>
            <Text style={styles.bigPrice}>
              {formatMoney(previousNum)} / {basis.label}
            </Text>
            {priceNum !== null && (
              <Text style={previousNum > priceNum ? styles.verdictGood : styles.verdictBad}>
                {previousNum > priceNum
                  ? `${Math.round((1 - priceNum / previousNum) * 100)}% off`
                  : 'Not lower than the previous price'}
              </Text>
            )}
          </View>
        )}

        {/* 3/4 -- StatCan reference, only when there's no previous price */}
        {previousNum === null && (
          <View style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, styles.sectionTitleInCard]}>
              {reference?.aiReasoning !== undefined ? 'AI reference' : 'StatCan reference'}
            </Text>
            {priceNum === null ? (
              <Text style={styles.note}>Add the cutout price first -- the reference is compared against it.</Text>
            ) : statcanError ? (
              <Text style={styles.note}>Couldn't load the StatCan table. Check the dev server/console.</Text>
            ) : statcan === null ? (
              <ActivityIndicator color={INK} />
            ) : (
              <>
                {reference ? (
                  <>
                    {/* No grey outline around the table (Anabelle: "remove the
                        exterior border of the table") -- it sits straight in
                        the white card. */}
                    <View style={styles.referenceBlock}>
                      {/* For an AI estimate, the wording it was asked to price. */}
                      <Text style={styles.referenceName}>{reference.name}</Text>
                      <ReferenceComparisonTable
                        referenceLabel={referenceLabel}
                        referencePrice={reference.avgPrice}
                        referenceUnit={reference.unit}
                        cutoutPrice={priceNum}
                        converted={converted}
                      />
                      {reference.aiReasoning ? <Text style={styles.note}>{reference.aiReasoning}</Text> : null}
                    </View>
                    {/* The result and the decision sit outside the table
                        (Anabelle: "move 'Cutout is 51...' and the buttons
                        outside of the table"). */}
                    <ComparisonResult converted={converted} referenceLabel={referenceLabel} />
                    {decision === 'approved' ? (
                      <View style={styles.refActionRow}>
                        <View style={styles.approvedPill}>
                          <CheckIcon size={14} color="#1E7B34" strokeWidth={2.5} />
                          <Text style={styles.approvedPillText}>Reference approved</Text>
                        </View>
                        <Pressable onPress={() => setDecision('undecided')} hitSlop={8}>
                          <Text style={styles.textLink}>Undo</Text>
                        </Pressable>
                      </View>
                    ) : decision === 'rejected' ? (
                      <Pressable onPress={() => setDecision('undecided')} hitSlop={8}>
                        <Text style={styles.textLink}>Rejected -- undo</Text>
                      </Pressable>
                    ) : (
                      <View style={styles.refActionRow}>
                        <Pressable style={styles.refRejectButton} onPress={() => setDecision('rejected')}>
                          <Text style={styles.refRejectButtonText}>Reject</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.refApproveButton, !canApprove && styles.saveButtonDisabled]}
                          disabled={!canApprove}
                          onPress={() => setDecision('approved')}
                        >
                          <Text style={styles.refApproveButtonText}>Approve</Text>
                        </Pressable>
                      </View>
                    )}
                  </>
                ) : (
                  <Text style={styles.note}>No StatCan item matches this name -- search for the right one below.</Text>
                )}

                {/* Anabelle: "Sometimes you dont look for the correct items in
                    statcan e.g. here would be frozen pizza. So if i see you
                    have not search the correct word, i should be able to
                    look it up". Search opens once the match is rejected (or
                    when nothing matched); picking a result replaces the item
                    above, ready to approve. */}
                {showSearch && (
                  <View style={styles.panel}>
                    <Text style={styles.fieldLabel}>Search StatCan</Text>
                    <InputField
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      placeholder='e.g. "frozen pizza"'
                      autoCapitalize="none"
                    />
                    {searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                      <Text style={styles.note}>No StatCan item contains "{searchQuery.trim()}".</Text>
                    )}
                    {searchResults.map((result) => (
                      <Pressable
                        key={`${result.name}-${result.unit}`}
                        style={styles.searchResult}
                        onPress={() => {
                          setPickedReference(result);
                          setDecision('undecided');
                          setSearchOpen(false);
                          setSearchQuery('');
                        }}
                      >
                        <Text style={styles.referenceName}>{result.name}</Text>
                        <Text style={styles.note}>
                          {formatMoney(result.avgPrice)} / {result.unit.replace(/^per\s+/i, '')}
                        </Text>
                      </Pressable>
                    ))}
                    {/* For when StatCan has nothing comparable (Anabelle, on
                        extra lean ground beef vs StatCan's plain "Ground
                        beef"). */}
                    <Text style={styles.fieldLabel}>No match? AI estimate for</Text>
                    <InputField value={aiQuery} onChangeText={setAiQuery} placeholder="Item to estimate" />
                    <Pressable
                      style={[styles.tertiaryButton, aiLoading && styles.saveButtonDisabled]}
                      onPress={getAiEstimate}
                      disabled={aiLoading}
                    >
                      {aiLoading ? (
                        <ActivityIndicator color={INK} />
                      ) : (
                        <Text style={styles.tertiaryButtonText}>Get AI estimate</Text>
                      )}
                    </Pressable>
                    {aiError && <Text style={styles.saveError}>{aiError}</Text>}
                  </View>
                )}

                {decision === 'rejected' && (
                  <Text style={styles.note}>
                    Saving now leaves this deal with no comparison price (no deal badge) -- pick the right StatCan item
                    or get an AI estimate instead.
                  </Text>
                )}
              </>
            )}
          </View>
        )}

        {/* 5 -- Recipes or Deals section only */}
        <Text style={styles.sectionTitle}>Use in recipes?</Text>
        <SegmentedControl wrap options={USAGE_OPTIONS} value={usage} onChange={setUsage} />
        {usage === 'recipes' && (
          <>
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
          </>
        )}

        {/* 6 -- Reject the deal, or save it */}
        {saveError && <Text style={styles.saveError}>{saveError}</Text>}
        <View style={styles.actionRow}>
          <Pressable
            style={[styles.rejectButton, saving && styles.saveButtonDisabled]}
            onPress={handleReject}
            disabled={saving}
          >
            <Text style={styles.rejectButtonText}>Reject deal</Text>
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

// StatCan stores a denomination as free text -- "390 grams", "per
// kilogram". Shortened for display: "390 g", "kg".
function shortUnit(unit: string): string {
  return unit
    .replace(/^per\s+/i, '')
    .replace(/\bkilograms?\b/i, 'kg')
    .replace(/\bgrams?\b/i, 'g')
    .replace(/\bmillilit(?:re|er)s?\b/i, 'ml')
    .replace(/\blit(?:re|er)s?\b/i, 'L')
    .replace(/\bpounds?\b/i, 'lb');
}

// The comparison as a small table (Anabelle, 2026-09-18): the cutout on
// the left, StatCan on the right; each price as published, then both
// normalized to the same basis (per 100 g / 100 ml / each) so they can be
// compared at a glance; the percentage as the footer row.
function ReferenceComparisonTable({
  referenceLabel,
  referencePrice,
  referenceUnit,
  cutoutPrice,
  converted,
}: {
  referenceLabel: string;
  referencePrice: number;
  referenceUnit: string;
  cutoutPrice: number;
  converted: ConvertedReference | null;
}) {
  if (!converted) return null;
  if (!converted.ok) return <Text style={styles.verdictBad}>{converted.reason}</Text>;
  return (
    <View style={styles.table}>
      <View style={styles.tableRow}>
        <View style={styles.tableCell}>
          <Text style={styles.tableHeader}>Cutout</Text>
        </View>
        <View style={[styles.tableCell, styles.tableCellRight]}>
          <Text style={styles.tableHeader}>{referenceLabel === 'StatCan' ? 'StatCan' : 'AI estimate'}</Text>
        </View>
      </View>
      <View style={[styles.tableRow, styles.tableRowDivider]}>
        <View style={styles.tableCell}>
          <Text style={styles.tableLabel}>Price</Text>
          <Text style={styles.tableValue}>
            {formatMoney(cutoutPrice)} / {converted.cutoutQuantityLabel}
          </Text>
        </View>
        <View style={[styles.tableCell, styles.tableCellRight]}>
          <Text style={styles.tableLabel}>Price</Text>
          <Text style={styles.tableValue}>
            {formatMoney(referencePrice)} / {shortUnit(referenceUnit)}
          </Text>
        </View>
      </View>
      <View style={[styles.tableRow, styles.tableRowDivider]}>
        <View style={styles.tableCell}>
          <Text style={styles.tableLabel}>Per {converted.basisLabel}</Text>
          <Text style={styles.tableValue}>
            {formatMoney(converted.cutoutPerBasis)} / {converted.basisLabel}
          </Text>
        </View>
        <View style={[styles.tableCell, styles.tableCellRight]}>
          <Text style={styles.tableLabel}>Per {converted.basisLabel}</Text>
          <Text style={styles.tableValue}>
            {formatMoney(converted.referencePerBasis)} / {converted.basisLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}

// The comparison's outcome, shown under the table: the percentage, or
// why the reference can't be approved.
function ComparisonResult({
  converted,
  referenceLabel,
}: {
  converted: ConvertedReference | null;
  referenceLabel: string;
}) {
  if (!converted?.ok) return null;
  if (converted.implausible) {
    return (
      <Text style={styles.verdictBad}>
        {referenceLabel} is {IMPLAUSIBLE_BENCHMARK_RATIO}x+ the cutout price -- almost always a unit mix-up, so it can't be
        approved. Check "Price is per".
      </Text>
    );
  }
  const pct = Math.round(converted.pctVsReference);
  // Same colors as the tag this deal gets on a recipe (MealCard's
  // greatValueBadge / fairPriceBadge) -- Anabelle: "make the cutout result
  // a tag that is the same color as the tag that would appear in the
  // recipe". Same rule too: isGreatReferenceValue() decides purple
  // ("Up to N% below") vs orange ("Fair price").
  const great = isGreatReferenceValue(-converted.pctVsReference, 'reference');
  return (
    <View style={[styles.resultTag, great ? styles.resultTagGreat : styles.resultTagFair]}>
      <Text style={[styles.resultTagText, great ? styles.resultTagTextGreat : styles.resultTagTextFair]}>
        {pct === 0
          ? `Same as ${referenceLabel}`
          : `Cutout is ${Math.abs(pct)}% ${pct < 0 ? 'below' : 'above'} ${referenceLabel}`}
      </Text>
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
  dropdown: { alignSelf: 'flex-start', zIndex: 20 },
  dropdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  dropdownPillText: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    marginTop: 6,
    minWidth: 220,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: INK,
    borderRadius: 14,
    paddingVertical: 4,
    zIndex: 10,
    elevation: 4,
  },
  dropdownMenuLeft: { left: 0 },
  dropdownMenuRight: { right: 0 },
  dropdownMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  dropdownMenuItemText: { fontSize: 14, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold', color: INK, flex: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 20 },
  searchInputFlex: { flex: 1 },
  dealRow: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 16,
    padding: 12,
  },
  productCountBadge: { backgroundColor: '#F2F2F2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  productCountBadgeText: { fontSize: 11, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  cutoutTitle: { fontSize: 18, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  sectionTitle: { fontSize: 16, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK, marginTop: 8 },
  cutoutHint: { fontSize: 12, color: '#D0342C', marginTop: 4 },
  // A product the cutout lists that has no deal of its own yet -- dashed
  // so it reads as "not a deal yet", with its one action right on it.
  missingPartRow: { borderStyle: 'dashed', alignItems: 'center' },
  missingPartName: { flex: 1 },
  dealThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#F2F2F2' },
  dealRowInfo: { flex: 1, gap: 2 },
  dealRowName: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  dealRowStore: { fontSize: 12, color: '#767676' },
  dealRowPriceLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  dealRowPrice: { fontSize: 14, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  dealRowOriginal: { fontSize: 12, fontWeight: '400', color: '#aaa', textDecorationLine: 'line-through' },
  unitBadge: { backgroundColor: '#F2F2F2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  unitBadgeText: { fontSize: 11, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: '#666' },
  // Light purple -- distinct from unitBadge's neutral gray so a zone tag
  // reads as its own kind of information, not a variant of price_unit.
  zoneBadge: { backgroundColor: '#EDE7FE', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  zoneBadgeText: { fontSize: 11, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: '#6B46C1' },
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
  nameTitle: { fontSize: 22, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  // Same borderless white card as NotificationsSection/ManageAccountSection.
  sectionCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 8 },
  sectionTitleInCard: { marginTop: 0 },
  tertiaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  tertiaryButtonText: { color: INK, fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  perRow: { flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 20 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bigPrice: { fontSize: 20, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  textLink: { fontSize: 14, color: INK, textDecorationLine: 'underline' },
  note: { fontSize: 13, color: '#767676' },
  panel: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#C7C7C7',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  referenceBlock: { gap: 6 },
  referenceName: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  searchResult: { borderTopWidth: 1, borderTopColor: '#E5E5E5', paddingVertical: 8, gap: 2 },
  // No outer border (Anabelle) -- only the dividers between cells.
  table: { overflow: 'hidden' },
  tableRow: { flexDirection: 'row' },
  tableRowDivider: { borderTopWidth: 1, borderTopColor: '#E5E5E5' },
  tableCell: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
  tableCellRight: { borderLeftWidth: 1, borderLeftColor: '#E5E5E5' },
  tableHeader: { fontSize: 13, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  tableLabel: { fontSize: 12, color: '#767676' },
  tableValue: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  resultTag: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  resultTagGreat: { backgroundColor: '#EDE7FE' },
  resultTagFair: { backgroundColor: '#FFEAD4' },
  resultTagText: { fontSize: 14, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  resultTagTextGreat: { color: '#6B46C1' },
  resultTagTextFair: { color: '#FF7A2A' },
  verdictGood: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: '#1B7F3B' },
  verdictBad: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: '#D0342C' },
  refActionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  refApproveButton: { backgroundColor: INK, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 18 },
  refApproveButtonText: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  refRejectButton: {
    borderWidth: 1.5,
    borderColor: '#D0342C',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: '#fff',
  },
  refRejectButtonText: { color: '#D0342C', fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  // The app's confirmation green (Toast.tsx / MembershipStatus / MealCard's
  // "Added" badge: bg #E8F5E9, icon/text #1E7B34) -- Anabelle: "match the
  // color schema of the approval badge to our confirmation badge green".
  approvedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8F5E9',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  approvedPillText: { color: '#1E7B34', fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  storeTag: { alignSelf: 'flex-start', backgroundColor: INK, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  storeTagText: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: '#fff' },
  editStore: { fontSize: 14, color: '#767676', marginTop: -8 },
  // A structural action (creates new rows), so it gets its own color
  // rather than reusing the INK-outlined convention used elsewhere on
  // this screen.
  splitButton: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  splitButtonText: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: '#3B82F6' },
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
    backgroundColor: '#fff',
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
