import type { Json } from '../types/database';
import { fetchWeeklyEmailConsent, setWeeklyEmailConsent } from './emailConsent';
import { supabase } from './supabase';

// public.users.notification_prefs (jsonb) has existed since the initial
// schema (20260725163230_init_schema.sql) as "the real future home for
// user notification preferences" (20260808010000's cleanup comment) --
// unused until now. Settings > Notifications (Anabelle, 2026-08-28, from
// a real reference screenshot) is its first real reader/writer.
export interface CategoryPrefs {
  promotionalOffers: boolean;
  membership: boolean;
  productUpdates: boolean;
  recommendations: boolean;
  reminders: boolean;
  feedback: boolean;
}

export interface NotificationPrefs {
  emailSubscribed: boolean;
  push: CategoryPrefs;
  email: CategoryPrefs;
}

// Six categories, not the reference screenshot's full list -- "Uber teen
// accounts", "Mother's day"/other seasonal promos, and "Third party ads"
// dropped (Anabelle's call): the first two are literally another
// product's own features, and Grrunch doesn't actually sell ad space to
// third parties, so that toggle would represent something that isn't
// real.
export const DEFAULT_CATEGORY_PREFS: CategoryPrefs = {
  promotionalOffers: true,
  membership: true,
  productUpdates: true,
  recommendations: true,
  reminders: true,
  feedback: true,
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  emailSubscribed: true,
  push: DEFAULT_CATEGORY_PREFS,
  email: DEFAULT_CATEGORY_PREFS,
};

export const CATEGORY_LABELS: { key: keyof CategoryPrefs; title: string; description: string }[] = [
  { key: 'promotionalOffers', title: 'Promotional offers', description: 'Deals, discounts and special offers' },
  { key: 'membership', title: 'Membership', description: 'Grrunch membership benefits, trial and renewal updates' },
  { key: 'productUpdates', title: 'Product updates & news', description: 'New features and app updates' },
  {
    key: 'recommendations',
    title: 'Recommendations',
    // The weekly email (2026-11-03). Its email switch is the consent in
    // public.email_consents, not this prefs blob: see fetch/save below.
    description: "This week's deals and recipes, every Thursday",
  },
  { key: 'reminders', title: 'Reminders', description: 'Reminders for your grocery list' },
  { key: 'feedback', title: 'Feedback', description: 'User research and marketing surveys' },
];

// Merges stored prefs over the defaults (not a plain cast) so a prefs blob
// saved before a category existed still gets that category's default
// rather than `undefined` rendering as unchecked.
function mergePrefs(stored: Partial<NotificationPrefs> | null | undefined): NotificationPrefs {
  return {
    emailSubscribed: stored?.emailSubscribed ?? DEFAULT_NOTIFICATION_PREFS.emailSubscribed,
    push: { ...DEFAULT_CATEGORY_PREFS, ...stored?.push },
    email: { ...DEFAULT_CATEGORY_PREFS, ...stored?.email },
  };
}

export async function fetchNotificationPrefs(
  userId: string
): Promise<{ prefs: NotificationPrefs; error: string | null }> {
  const [{ data, error }, weeklyEmail] = await Promise.all([
    supabase.from('users').select('notification_prefs').eq('id', userId).maybeSingle(),
    fetchWeeklyEmailConsent(userId),
  ]);
  if (error) {
    return { prefs: DEFAULT_NOTIFICATION_PREFS, error: error.message };
  }
  const prefs = mergePrefs(data?.notification_prefs as Partial<NotificationPrefs> | null);
  // Off until they've said yes (CASL): a default-on box isn't consent.
  return { prefs: { ...prefs, email: { ...prefs.email, recommendations: weeklyEmail } }, error: null };
}

export async function saveNotificationPrefs(
  userId: string,
  email: string | null,
  prefs: NotificationPrefs
): Promise<{ error: string | null }> {
  // upsert, not update -- same reason as lib/profile.ts: this row may not
  // exist yet. NotificationPrefs is a plain JSON-shaped object, just not
  // structurally identical to the generated Json type (no index
  // signature) -- same cast every other jsonb-column write in this app
  // would need for a typed shape.
  const { error } = await supabase
    .from('users')
    .upsert({ id: userId, email, notification_prefs: prefs as unknown as Json });
  if (error) return { error: error.message };
  // Turning the weekly email's switch on here is consent too.
  const weeklyEmail = prefs.email.recommendations;
  if (weeklyEmail !== (await fetchWeeklyEmailConsent(userId))) {
    return setWeeklyEmailConsent(userId, weeklyEmail, 'profile');
  }
  return { error: null };
}
