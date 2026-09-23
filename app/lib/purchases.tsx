import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import { useAuth } from './auth';

// The Grrunch Membership entitlement identifier -- created in the
// RevenueCat dashboard, attached to the Apple/Google subscription
// products there. One entitlement today (single paid tier, now available
// on two billing periods -- see the price constants below), same as
// subscriptions.status only ever having one real "paid" state.
// Deliberately named for the membership as a whole rather than a tier
// (Anabelle, 2026-09-21): if basic/plus/premium levels ever land, they'd
// be their own entitlements alongside this one, and a legacy
// 'grrunch_plus' that actually meant "any subscriber" would read as one
// of them. Must match the entitlement id in RevenueCat exactly.
const ENTITLEMENT_ID = 'grrunch_membership';

// Single source of truth for the two real price points (Anabelle,
// 2026-09-15: "Instead of offering a monthly price point i want to offer
// also an annual price point. $7.99 monthly or $69.99 annual"). The
// ACTUAL charged price always comes from the store via
// offering.monthly/offering.annual (product.priceString) once RevenueCat
// is configured -- these are ONLY the fallback display copy for the
// unconfigured state (no REVENUECAT_API_KEY yet, or web) and for any
// screen that wants to show a price before the offering has loaded.
// Exported from here (not duplicated per-screen) specifically because
// duplicating $5.99 across 4 files with no shared constant is exactly
// how that number went stale in the first place -- every one of those
// call sites now imports from here instead.
export const MONTHLY_PRICE_DISPLAY = '$7.99';
export const ANNUAL_PRICE_DISPLAY = '$69.99';
// $69.99 / 12 = $5.8325 -> $5.83/mo equivalent. Recompute by hand if the
// prices above ever change -- kept as a literal (not derived at runtime)
// since this only backs display copy, not any real charge.
export const ANNUAL_MONTHLY_EQUIVALENT_DISPLAY = '$5.83';
// (7.99*12 - 69.99) / (7.99*12) = 27.0%, rounded.
export const ANNUAL_SAVINGS_PCT = 27;

// Public RevenueCat SDK keys -- safe to embed client-side (unlike a
// secret/webhook key), same trust level as the Supabase anon key already
// in EXPO_PUBLIC_SUPABASE_ANON_KEY. Real values come from the RevenueCat
// dashboard once the Apple/Google apps are registered there -- until
// then these are unset and PurchasesProvider no-ops (see configured
// below) rather than crashing the app for anyone not testing purchases.
const REVENUECAT_API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});

interface PurchasesContextValue {
  // False until the RevenueCat SDK has been configured with a real key
  // (see REVENUECAT_API_KEY above) -- lets the UI hide the real
  // "Subscribe" button and fall back to explanatory copy instead of
  // erroring, for as long as the keys aren't set yet.
  configured: boolean;
  loading: boolean;
  offering: PurchasesOffering | null;
  isSubscribed: boolean;
  // The specific package (monthly or annual) backing the customer's
  // active entitlement, matched by product identifier -- null while
  // still loading, not subscribed, or (rarely) if the active product
  // isn't one of this offering's own packages. Lets a screen show the
  // real plan/price a member is actually on instead of a guess -- see
  // MembershipStatus.tsx, which used to hardcode "$5.99/mo" regardless
  // of what was actually purchased.
  activePackage: PurchasesPackage | null;
  // ISO date string the active entitlement next renews or expires on,
  // and whether it's actually set to renew -- both straight from
  // RevenueCat's CustomerInfo, null/false while not subscribed. Lets a
  // screen show real billing-cycle details instead of a guess (Anabelle,
  // 2026-09-17: Profile's member card should show "billing cycle... and
  // a cancel membership button") -- there's deliberately no way to
  // toggle willRenew from in here: Apple/Google don't let a third-party
  // app control a store subscription's auto-renew state directly, only
  // display it and deep-link out to the platform's own subscription
  // management (see MembershipStatus.tsx's cancel button).
  expirationDate: string | null;
  willRenew: boolean;
  // True while the active entitlement is in Apple/Google's free
  // introductory period (the 1-month free trial on both products) --
  // lets useSubscription() report 'trialing' vs 'active' from the store
  // itself instead of the DB row (see lib/subscription.tsx).
  isTrial: boolean;
  // Whether this customer has EVER held the entitlement (active or
  // since expired) -- distinguishes a lapsed member ('expired') from
  // someone who never subscribed ('none').
  hadEntitlement: boolean;
  purchase: (pkg: PurchasesPackage) => Promise<{ error: string | null }>;
  // restored tells the caller whether an entitlement was actually found,
  // not just whether the call itself succeeded -- Purchases.
  // restorePurchases() resolves without error even when there's genuinely
  // nothing to restore, so error:null alone can't tell "restored
  // something" apart from "found nothing" (real gap, Anabelle,
  // 2026-09-11: upgrade.tsx used to treat both the same, silently
  // closing either way with zero feedback).
  restore: () => Promise<{ error: string | null; restored: boolean }>;
}

const PurchasesContext = createContext<PurchasesContextValue | undefined>(undefined);

function isEntitled(info: CustomerInfo): boolean {
  return typeof info.entitlements.active[ENTITLEMENT_ID] !== 'undefined';
}

// The store product identifier that unlocked the active entitlement, if
// any -- e.g. distinguishing the monthly product from the annual one, so
// activePackage below can find the matching PurchasesPackage.
function activeProductId(info: CustomerInfo): string | null {
  return info.entitlements.active[ENTITLEMENT_ID]?.productIdentifier ?? null;
}

function activeExpirationDate(info: CustomerInfo): string | null {
  return info.entitlements.active[ENTITLEMENT_ID]?.expirationDate ?? null;
}

function activeWillRenew(info: CustomerInfo): boolean {
  return info.entitlements.active[ENTITLEMENT_ID]?.willRenew ?? false;
}

// react-native-purchases has no web implementation at all -- it's an
// Apple/Google in-app-purchase SDK, and this product deliberately has no
// web version to sell through (see this session's Stripe-vs-IAP
// discussion). Claude's own preview/dev tooling still runs the app on
// web sometimes though, so this guard keeps that from hard-crashing --
// every SDK call below is skipped on web, `configured` just stays false,
// and upgrade.tsx's existing "not configured yet" fallback copy covers
// the gap. Native (iOS/Android) is unaffected.
const IS_NATIVE = Platform.OS !== 'web';

export function PurchasesProvider({ children }: { children: ReactNode }) {
  const { session, isGuest } = useAuth();
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [activeProduct, setActiveProduct] = useState<string | null>(null);
  const [expirationDate, setExpirationDate] = useState<string | null>(null);
  const [willRenew, setWillRenew] = useState(false);
  const [isTrial, setIsTrial] = useState(false);
  const [hadEntitlement, setHadEntitlement] = useState(false);

  // One place to fan a fresh CustomerInfo out to all four pieces of
  // state, instead of the same four setters repeated at every call site
  // (the listener below, the initial fetch, purchase(), restore()).
  function applyCustomerInfo(info: CustomerInfo) {
    setIsSubscribed(isEntitled(info));
    setActiveProduct(activeProductId(info));
    setExpirationDate(activeExpirationDate(info));
    setWillRenew(activeWillRenew(info));
    setIsTrial(info.entitlements.active[ENTITLEMENT_ID]?.periodType === 'TRIAL');
    setHadEntitlement(typeof info.entitlements.all[ENTITLEMENT_ID] !== 'undefined');
  }

  // Configure the SDK exactly once. Guests never call Purchases.logIn
  // below (RevenueCat tracks them under its own anonymous id until a
  // real account exists) -- matches the rest of the app's guest model,
  // where nothing meaningful persists until sign-up.
  useEffect(() => {
    if (!IS_NATIVE || !REVENUECAT_API_KEY) {
      // Keys not set up yet -- see the comment above. Don't throw; just
      // stay unconfigured so upgrade.tsx can fall back gracefully.
      setLoading(false);
      return;
    }
    Purchases.configure({ apiKey: REVENUECAT_API_KEY });
    setConfigured(true);
  }, []);

  // Identify the RevenueCat customer as this Supabase user -- this is
  // what lets the revenuecat-webhook Edge Function map an incoming
  // webhook event's app_user_id straight back to subscriptions.user_id
  // with no separate mapping table. A guest (no session) is left on
  // RevenueCat's own anonymous id; logOut() when a session ends so a
  // shared/borrowed device doesn't leak one account's entitlement into
  // the next guest session.
  useEffect(() => {
    if (!configured) return;
    if (session && !isGuest) {
      Purchases.logIn(session.user.id).catch(() => {
        // Non-fatal -- customerInfo listener below still reflects
        // whatever identity is currently active.
      });
    } else {
      Purchases.logOut().catch(() => {});
    }
  }, [configured, session, isGuest]);

  // Live entitlement state -- fires immediately with the current
  // CustomerInfo and again on any change (purchase, renewal,
  // cancellation, restore), so isSubscribed here never needs a manual
  // refetch the way subscriptions.tsx's DB-backed status does.
  useEffect(() => {
    if (!configured) return;
    const listener = (info: CustomerInfo) => applyCustomerInfo(info);
    Purchases.addCustomerInfoUpdateListener(listener);
    Purchases.getCustomerInfo()
      .then(applyCustomerInfo)
      .finally(() => setLoading(false));
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [configured]);

  useEffect(() => {
    if (!configured) return;
    Purchases.getOfferings()
      .then((offerings) => setOffering(offerings.current))
      .catch(() => setOffering(null));
  }, [configured]);

  async function purchase(pkg: PurchasesPackage): Promise<{ error: string | null }> {
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      applyCustomerInfo(customerInfo);
      return { error: null };
    } catch (e: any) {
      if (e?.userCancelled) return { error: null };
      return { error: e?.message ?? 'Purchase failed. Please try again.' };
    }
  }

  async function restore(): Promise<{ error: string | null; restored: boolean }> {
    try {
      const info = await Purchases.restorePurchases();
      const restored = isEntitled(info);
      applyCustomerInfo(info);
      return { error: null, restored };
    } catch (e: any) {
      return { error: e?.message ?? 'Could not restore purchases.', restored: false };
    }
  }

  // Derived, not stored -- recomputed whenever the offering or the active
  // product changes, rather than a third piece of state that could drift
  // out of sync with either of them.
  const activePackage =
    offering?.availablePackages.find((p) => p.product.identifier === activeProduct) ?? null;

  return (
    <PurchasesContext.Provider
      value={{
        configured,
        loading,
        offering,
        isSubscribed,
        activePackage,
        expirationDate,
        willRenew,
        isTrial,
        hadEntitlement,
        purchase,
        restore,
      }}
    >
      {children}
    </PurchasesContext.Provider>
  );
}

export function usePurchases(): PurchasesContextValue {
  const ctx = useContext(PurchasesContext);
  if (!ctx) {
    throw new Error('usePurchases must be used within a PurchasesProvider');
  }
  return ctx;
}
