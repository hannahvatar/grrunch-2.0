import { supabase } from './supabase';

export type WaitlistSource = 'onboarding' | 'upgrade';

// Same shape check as the waitlist table's own email constraint
// (supabase/migrations/20260923010000_waitlist.sql) -- catches typos
// before the round trip, the database is still the real gate.
export function isValidEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
}

// Postgres unique_violation -- this email is already on the list, which
// is the outcome the person wanted anyway.
const ALREADY_ON_LIST = '23505';

// Adds an email to the "tell me when Grrunch reaches my area" list.
// Coords are rounded to one decimal (~10 km) here, before they ever
// leave the device -- see the table's own comment.
export async function joinWaitlist(opts: {
  email: string;
  source: WaitlistSource;
  userId?: string | null;
  coords?: { lat: number; lng: number } | null;
}): Promise<{ error: string | null }> {
  const round = (n: number) => Math.round(n * 10) / 10;
  // Plain insert, not upsert -- there's no select policy on this table
  // (it's a private list of emails), which an upsert's conflict check
  // would need.
  const { error } = await supabase.from('waitlist').insert({
    email: opts.email.trim(),
    source: opts.source,
    user_id: opts.userId ?? null,
    approx_lat: opts.coords ? round(opts.coords.lat) : null,
    approx_lng: opts.coords ? round(opts.coords.lng) : null,
  });
  if (error && error.code !== ALREADY_ON_LIST) {
    return { error: error.message };
  }
  return { error: null };
}
