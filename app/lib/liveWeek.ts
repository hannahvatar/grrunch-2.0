import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { supabase } from './supabase';

// The live week (public.published_week, one row, set by publish_week() --
// supabase/migrations/20260918010000_weekly_publish.sql and
// 20260924010000_weekly_cutoff_schedule.sql).
//
// Weekly rhythm (Anabelle, 2026-09-24, revised same day), Vancouver time:
//   - Wednesday 11:59 pm (when the flyers end): the week CLOSES (closesAt) -- Meals and Weekly
//     Deals go to the "new deals are coming" empty state, the grocery list
//     clears, and anyone browsing gets a modal (WeekClosedModal).
//   - Thursday 12:00 pm: the scheduled draft week goes live server-side;
//     open apps pick it up here (publishedAt changes).
//
// `expired` (the flyers' own end date has passed) is kept for the grey
// "Expired" deal badges if the flyers' own end date ever falls before the close.
export interface LiveWeek {
  validFrom: string;
  validTo: string;
  expired: boolean;
  publishedAt: string;
  closesAt: string | null;
  closed: boolean;
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

function isClosed(closesAt: string | null): boolean {
  return !!closesAt && Date.now() >= new Date(closesAt).getTime();
}

export async function fetchLiveWeek(): Promise<LiveWeek | null> {
  const { data, error } = await supabase
    .from('published_week')
    .select('flyer_valid_from, flyer_valid_to, published_at, closes_at')
    .maybeSingle();
  if (error || !data) return null;
  return {
    validFrom: data.flyer_valid_from,
    validTo: data.flyer_valid_to,
    expired: isFlyerWeekExpired(data.flyer_valid_to),
    publishedAt: data.published_at,
    closesAt: data.closes_at,
    closed: isClosed(data.closes_at),
  };
}

// One shared copy of the live week for the whole app -- MealCard and
// IngredientRow render many times per screen, so they all read this one
// store instead of each fetching. A failed fetch keeps whatever was last
// known (or null = "open, not expired"), so the app never shows a closed
// or expired state it can't back up.
//
// Kept current while the app is in use:
//   - re-fetched whenever the app comes back to the foreground;
//   - a timer flips `closed` at exactly closesAt, even with no fetch;
//   - while closed, polled every minute to catch the Thursday publish.
let current: LiveWeek | null = null;
let started = false;
const listeners = new Set<(week: LiveWeek | null) => void>();
let closeTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const POLL_WHILE_CLOSED_MS = 60 * 1000;

function sameWeek(a: LiveWeek | null, b: LiveWeek | null): boolean {
  return (
    a?.publishedAt === b?.publishedAt &&
    a?.closesAt === b?.closesAt &&
    a?.closed === b?.closed &&
    a?.expired === b?.expired
  );
}

function setCurrent(next: LiveWeek | null) {
  if (sameWeek(current, next)) return;
  current = next;
  scheduleTimers();
  listeners.forEach((listener) => listener(current));
}

async function refresh() {
  const next = await fetchLiveWeek().catch(() => undefined);
  if (next !== undefined) setCurrent(next);
}

function scheduleTimers() {
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = null;
  if (current?.closesAt && !current.closed) {
    const ms = new Date(current.closesAt).getTime() - Date.now();
    // setTimeout can't hold more than ~24.8 days; a week is well under.
    closeTimer = setTimeout(
      () => {
        if (current) setCurrent({ ...current, closed: true, expired: isFlyerWeekExpired(current.validTo) });
      },
      Math.max(0, ms)
    );
  }
  if (current?.closed && !pollTimer) {
    pollTimer = setInterval(refresh, POLL_WHILE_CLOSED_MS);
  } else if (!current?.closed && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function start() {
  if (started) return;
  started = true;
  refresh();
  AppState.addEventListener('change', (state) => {
    if (state === 'active') refresh();
  });
}

export function useLiveWeek(): LiveWeek | null {
  const [liveWeek, setLiveWeek] = useState<LiveWeek | null>(current);
  useEffect(() => {
    start();
    listeners.add(setLiveWeek);
    setLiveWeek(current);
    return () => {
      listeners.delete(setLiveWeek);
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
