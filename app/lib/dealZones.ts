import type { Deal } from './curatedDeals';
import type { SelectedStore } from './selectedStores';

// Matches a selected store to the zone label its chain's deal prices are
// actually tagged with in curated_deals.zone (Anabelle, 2026-09-14: "We
// have different zone coverages as banners can change their pricing
// according to store area... user select a Real Canadian Superstore
// outside of Burnaby. Are the price still accurate?").
//
// Real, confirmed gap: banners like Real Canadian Superstore genuinely
// run different price tiers by region (Anabelle's own flyer-download
// tracking sheet -- e.g. RCSS "Vancouver, Burnaby (urban zone)" vs
// "everywhere else in BC"), but curated_deals had no way to record which
// tier a price came from at all until 20260914010000_curated_deals_zone.sql
// added the column. This file is the other half: given a store's real
// lat/lng (from the Select-a-Store picker or onboarding), which of that
// CHAIN'S zone labels is it actually closest to.
//
// Only "core" zones -- the ones actually downloaded/synced every week,
// per the team's own flyer-download tracking sheet -- are listed here.
// Several chains have additional "optional" zones in that sheet
// (Safeway's East Kootenay/Peace edition, No Frills' Downtown/Parksville/
// Merritt/Quesnel editions) that aren't currently being synced at all --
// matching a store to one of those would just mean "zero zone-tagged
// deals for you", which is worse than the honest best-effort answer of
// "here's the closest zone we DO track prices for". Anchor coordinates
// are each zone's real city center (not survey-precise, just far enough
// apart from each other that nearest-match is unambiguous).
interface ZoneAnchor {
  zone: string;
  lat: number;
  lng: number;
}

const ZONES_BY_CHAIN: Record<string, ZoneAnchor[]> = {
  Safeway: [{ zone: 'Vancouver (East)', lat: 49.2827, lng: -123.1207 }],
  'Save-On-Foods': [
    { zone: 'Vancouver (East)', lat: 49.2827, lng: -123.1207 },
    { zone: 'Victoria', lat: 48.4284, lng: -123.3656 },
    { zone: 'Hope', lat: 49.383, lng: -121.4419 },
  ],
  'Real Canadian Superstore': [
    { zone: 'Vancouver (East)', lat: 49.2827, lng: -123.1207 },
    { zone: 'North Vancouver', lat: 49.326, lng: -123.071 },
  ],
  Walmart: [{ zone: 'Vancouver (East)', lat: 49.2827, lng: -123.1207 }],
  'No Frills': [
    { zone: 'Vancouver (East)', lat: 49.2827, lng: -123.1207 },
    { zone: 'Sechelt', lat: 49.475, lng: -123.7466 },
  ],
};

// The known-good zone names for a chain -- e.g. for dev-deals.tsx's zone
// filter/editor, so a reviewer can only pick a value that actually matches
// what nearestZoneForChain() can produce (freeform text risks a typo
// silently breaking the match: "Vancouver (east)" would never equal
// "Vancouver (East)"). Empty for a chain not in ZONES_BY_CHAIN.
export function knownZonesForChain(chainName: string): string[] {
  return (ZONES_BY_CHAIN[chainName] ?? []).map((z) => z.zone);
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Null when this chain has no known zones (not one of the 5 tracked
// above) or the store has no lat/lng on record -- callers treat null as
// "don't filter", same as an unmatched chain always showing everything
// today.
export function nearestZoneForChain(chainName: string, lat: number | null, lng: number | null): string | null {
  if (lat === null || lng === null) return null;
  const zones = ZONES_BY_CHAIN[chainName];
  if (!zones || zones.length === 0) return null;
  return zones.reduce((closest, z) =>
    haversineMeters(lat, lng, z.lat, z.lng) < haversineMeters(lat, lng, closest.lat, closest.lng) ? z : closest
  ).zone;
}

// Excludes a deal ONLY when we have a real, tagged zone on the deal AND a
// real, computed zone for the user's own selected store of that chain,
// AND they disagree -- deliberately conservative in every other
// direction (no zone tag on the deal -- most rows, still; user hasn't
// picked a store for this chain; that chain isn't one of the 5 tracked
// above; the store has no lat/lng on record) rather than hiding a deal
// on a guess. See this file's own header comment and curated_deals.zone's
// migration comment for why "unknown" and "wrong" have to stay distinct
// given how incomplete the underlying zone tagging still is.
export function filterDealsByZone(deals: Deal[], selectedStores: SelectedStore[]): Deal[] {
  const userZoneByChain = new Map<string, string | null>();
  for (const store of selectedStores) {
    userZoneByChain.set(store.name, nearestZoneForChain(store.name, store.lat ?? null, store.lng ?? null));
  }

  return deals.filter((deal) => {
    if (!deal.zone) return true;
    const userZone = userZoneByChain.get(deal.chainName);
    if (!userZone) return true;
    return deal.zone === userZone;
  });
}
