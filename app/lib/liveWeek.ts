import { useEffect, useState } from 'react';

import { supabase } from './supabase';

// The live week's flyer dates (public.published_week, one row, set by
// publish_week() -- supabase/migrations/20260918010000_weekly_publish.sql).
//
// Anabelle, 2026-09-18: between stores releasing new flyers and our own
// weekly publish, shoppers keep seeing last week's deals, "marked that
// current deals are expired", alongside a message that fresh deals are
// on the way. "Expired" comes from the flyers' own end date rather than a
// fixed weekday/hour, since exactly when each chain goes live wasn't
// confirmed yet ("this has to be confirmed").
export interface LiveWeek {
  validFrom: string;
  validTo: string;
  expired: boolean;
}

// Today's date in BC (YYYY-MM-DD). Flyer dates are BC calendar dates, so
// the comparison has to happen in Vancouver time, not the device's or UTC.
function todayInBC(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Vancouver',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    // No time-zone data in this JS runtime: Pacific Standard Time is close
    // enough for a day-level check.
    return new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
}

// Expired from the day AFTER the flyers' last valid day.
export function isFlyerWeekExpired(validTo: string, today: string = todayInBC()): boolean {
  return today > validTo;
}

export async function fetchLiveWeek(): Promise<LiveWeek | null> {
  const { data, error } = await supabase
    .from('published_week')
    .select('flyer_valid_from, flyer_valid_to')
    .maybeSingle();
  if (error || !data) return null;
  return {
    validFrom: data.flyer_valid_from,
    validTo: data.flyer_valid_to,
    expired: isFlyerWeekExpired(data.flyer_valid_to),
  };
}

// One shared fetch per app session, however many cards ask -- MealCard and
// IngredientRow render many times per screen. A failed fetch reads as "not
// expired", so the app never shows an expired state it can't back up.
let liveWeekPromise: Promise<LiveWeek | null> | null = null;

export function useLiveWeek(): LiveWeek | null {
  const [liveWeek, setLiveWeek] = useState<LiveWeek | null>(null);
  useEffect(() => {
    if (!liveWeekPromise) {
      liveWeekPromise = fetchLiveWeek().catch(() => null);
    }
    let cancelled = false;
    liveWeekPromise.then((week) => {
      if (!cancelled) setLiveWeek(week);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return liveWeek;
}

export function useLiveWeekExpired(): boolean {
  return useLiveWeek()?.expired ?? false;
}

export const FRESH_DEALS_BANNER_TITLE = 'Fresh deals are on the way';
export const FRESH_DEALS_BANNER_BODY =
  "Stores just released their new flyers and we're reviewing them for you. Until then, these deals are from last week's flyers and have expired.";
