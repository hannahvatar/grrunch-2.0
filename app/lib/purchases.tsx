import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import { useAuth } from './auth';

// The Grrunch Plus entitlement identifier -- created in the RevenueCat
// dashboard, attached to the Apple/Google subscription products there.
// One entitlement today (single paid tier), same as subscriptions.status
// only ever having one real "paid" state.
const ENTITLEMENT_ID = 'grrunch_plus';

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
  purchase: (pkg: PurchasesPackage) => Promise<{ error: string | null }>;
  restore: () => Promise<{ error: string | null }>;
}

const PurchasesContext = createContext<PurchasesContextValue | undefined>(undefined);

function isEntitled(info: CustomerInfo): boolean {
  return typeof info.entitlements.active[ENTITLEMENT_ID] !== 'undefined';
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
    const listener = (info: CustomerInfo) => setIsSubscribed(isEntitled(info));
    Purchases.addCustomerInfoUpdateListener(listener);
    Purchases.getCustomerInfo()
      .then((info) => setIsSubscribed(isEntitled(info)))
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
      setIsSubscribed(isEntitled(customerInfo));
      return { error: null };
    } catch (e: any) {
      if (e?.userCancelled) return { error: null };
      return { error: e?.message ?? 'Purchase failed. Please try again.' };
    }
  }

  async function restore(): Promise<{ error: string | null }> {
    try {
      const info = await Purchases.restorePurchases();
      setIsSubscribed(isEntitled(info));
      return { error: null };
    } catch (e: any) {
      return { error: e?.message ?? 'Could not restore purchases.' };
    }
  }

  return (
    <PurchasesContext.Provider value={{ configured, loading, offering, isSubscribed, purchase, restore }}>
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
