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
  // When the next week is set to go live (dev-deals "Schedule publish").
  // Null until the draft week is scheduled.
  scheduledPublishAt: string | null;
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

// Dev previews, set in .env (dev builds only, the real week is untouched):
//   EXPO_PUBLIC_PREVIEW_WEEK_GAP=1        the Wednesday-to-Thursday empty state
//   EXPO_PUBLIC_PREVIEW_WEEK_GAP=handover the whole handover, sped up: the
//     "ends in" banner for 90 s, the close popup, then 3 min after launch a
//     new week arrives (caught by the minute poll) with its popup.
const PREVIEW = __DEV__ ? process.env.EXPO_PUBLIC_PREVIEW_WEEK_GAP : undefined;
const PREVIEW_START = Date.now();

export async function fetchLiveWeek(): Promise<LiveWeek | null> {
  const { data, error } = await supabase
    .from('published_week')
    .select('flyer_valid_from, flyer_valid_to, published_at, closes_at, scheduled_publish_at')
    .maybeSingle();
  if (error || !data) return null;
  const real: LiveWeek = {
    validFrom: data.flyer_valid_from,
    validTo: data.flyer_valid_to,
    expired: isFlyerWeekExpired(data.flyer_valid_to),
    publishedAt: data.published_at,
    closesAt: data.closes_at,
    closed: isClosed(data.closes_at),
    scheduledPublishAt: data.scheduled_publish_at,
  };
  if (PREVIEW === '1') {
    // Closed an hour ago, the usual Thursday noon drop still to come.
    return { ...real, expired: false, closesAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), closed: true, scheduledPublishAt: null };
  }
  if (PREVIEW === 'handover') {
    const closesAt = new Date(PREVIEW_START + 90 * 1000).toISOString();
    const dropAt = new Date(PREVIEW_START + 180 * 1000).toISOString();
    if (Date.now() >= PREVIEW_START + 180 * 1000) {
      return { ...real, expired: false, publishedAt: dropAt, closesAt: new Date(Date.now() + 7 * 86400000).toISOString(), closed: false, scheduledPublishAt: null };
    }
    return { ...real, expired: false, closesAt, closed: isClosed(closesAt), scheduledPublishAt: dropAt };
  }
  return real;
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
//
// No swapping under someone's thumb (Anabelle, 2026-09-28: "it feels
// abrupt"). The screens render `shown`, not `actual`. When the week closes
// or a new week lands while the person is looking at the app, `shown`
// stays put and `pending` says which popup to show (WeekLifecycle.tsx);
// tapping it calls acknowledgeWeekChange() and only then do the screens
// change. If the change happened while the app was in the background (or
// it's the first load), there's nothing on screen to protect, so `shown`
// just follows.
export type WeekChange = 'closed' | 'newWeek';

let actual: LiveWeek | null = null;
let shown: LiveWeek | null = null;
let pending: WeekChange | null = null;
let loaded = false;
let started = false;
// Changes within this long of coming back to the foreground count as
// "happened while away" -- the refresh and an overdue close timer both
// land just after the app wakes.
const FOREGROUND_GRACE_MS = 3000;
let activeSince = 0;
const listeners = new Set<() => void>();
let closeTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const POLL_WHILE_CLOSED_MS = 60 * 1000;

function sameWeek(a: LiveWeek | null, b: LiveWeek | null): boolean {
  return (
    a?.publishedAt === b?.publishedAt &&
    a?.closesAt === b?.closesAt &&
    a?.closed === b?.closed &&
    a?.expired === b?.expired &&
    a?.scheduledPublishAt === b?.scheduledPublishAt
  );
}

function changeBetween(from: LiveWeek | null, to: LiveWeek | null): WeekChange | null {
  if (!from || !to) return null;
  if (from.publishedAt !== to.publishedAt) return 'newWeek';
  if (!from.closed && to.closed) return 'closed';
  return null;
}

function notify() {
  listeners.forEach((listener) => listener());
}

function setActual(next: LiveWeek | null) {
  const firstLoad = !loaded;
  loaded = true;
  if (!firstLoad && sameWeek(actual, next)) return;
  actual = next;
  scheduleTimers();

  const change = changeBetween(shown, next);
  const away =
    firstLoad || AppState.currentState !== 'active' || Date.now() - activeSince < FOREGROUND_GRACE_MS;
  if (change && !away) {
    pending = change;
  } else if (!pending) {
    shown = next;
  } else if (away) {
    shown = next;
    pending = null;
  }
  notify();
}

export function acknowledgeWeekChange() {
  shown = actual;
  pending = null;
  notify();
}

async function refresh() {
  const next = await fetchLiveWeek().catch(() => undefined);
  if (next !== undefined) setActual(next);
}

function scheduleTimers() {
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = null;
  if (actual?.closesAt && !actual.closed) {
    const ms = new Date(actual.closesAt).getTime() - Date.now();
    // setTimeout can't hold more than ~24.8 days; a week is well under.
    closeTimer = setTimeout(
      () => {
        if (actual) setActual({ ...actual, closed: true, expired: isFlyerWeekExpired(actual.validTo) });
      },
      Math.max(0, ms)
    );
  }
  if (actual?.closed && !pollTimer) {
    pollTimer = setInterval(refresh, POLL_WHILE_CLOSED_MS);
  } else if (!actual?.closed && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function start() {
  if (started) return;
  started = true;
  activeSince = Date.now();
  refresh();
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      activeSince = Date.now();
      refresh();
    }
  });
}

function useStore<T>(read: () => T): T {
  const [value, setValue] = useState<T>(read);
  useEffect(() => {
    start();
    const listener = () => setValue(read);
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read is a module-level getter
  }, []);
  return value;
}

// The week the screens should render (see "No swapping" above).
export function useLiveWeek(): LiveWeek | null {
  return useStore(() => shown);
}

// Which handover popup to show, if any. Only WeekLifecycle.tsx needs this.
export function usePendingWeekChange(): WeekChange | null {
  return useStore(() => pending);
}

// Milliseconds until the shown week closes, but only inside the last hour
// (Anabelle, 2026-09-28: a heads-up banner from Wednesday 11 pm). Null
// otherwise. Ticks every second inside the hour; outside it, sleeps until
// the hour starts.
export const CLOSING_SOON_MS = 60 * 60 * 1000;

export function useClosingCountdown(): number | null {
  const week = useLiveWeek();
  const closesAt = week && !week.closed && week.closesAt ? new Date(week.closesAt).getTime() : null;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (closesAt === null) return;
    const untilWindow = closesAt - CLOSING_SOON_MS - Date.now();
    if (untilWindow > 0) {
      const timer = setTimeout(() => setNow(Date.now()), Math.min(untilWindow, 2 ** 31 - 1));
      return () => clearTimeout(timer);
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [closesAt, now > (closesAt ?? 0) - CLOSING_SOON_MS]);
  if (closesAt === null) return null;
  const left = closesAt - now;
  return left > 0 && left <= CLOSING_SOON_MS ? left : null;
}

// When the empty-state countdown counts down to: the scheduled publish if
// there is one, otherwise the usual drop, the first Thursday 12:00 pm
// Vancouver time after the close. Vancouver is UTC-7 in PDT and UTC-8 in
// PST; noon PT is 19:00 or 20:00 UTC, so try both and keep the one that
// really is noon in Vancouver.
export function nextDropAt(week: LiveWeek | null): Date | null {
  if (!week) return null;
  if (week.scheduledPublishAt) return new Date(week.scheduledPublishAt);
  if (!week.closesAt) return null;
  const from = new Date(week.closesAt).getTime();
  for (let day = 0; day < 8; day++) {
    for (const utcHour of [19, 20]) {
      const base = new Date(from + day * 24 * 60 * 60 * 1000);
      const candidate = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), utcHour));
      if (candidate.getTime() <= from) continue;
      const parts = vancouverParts(candidate);
      if (parts && parts.weekday === 'Thu' && parts.hour === 12) return candidate;
    }
  }
  return null;
}

function vancouverParts(date: Date): { weekday: string; hour: number } | null {
  try {
    // format(), not formatToParts() -- the app's JS engine (Hermes) doesn't
    // have formatToParts. Gives e.g. "Thu, 12".
    const [weekday, hour] = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Vancouver',
      weekday: 'short',
      hour: 'numeric',
      hourCycle: 'h23',
    })
      .format(date)
      .split(', ');
    return { weekday, hour: Number(hour) };
  } catch {
    return null;
  }
}

export function useLiveWeekExpired(): boolean {
  return useLiveWeek()?.expired ?? false;
}

export const FRESH_DEALS_BANNER_TITLE = 'Fresh deals are on the way';
export const FRESH_DEALS_BANNER_BODY =
  "Stores just released their new flyers and we're reviewing them for you. Until then, these deals are from last week's flyers and have expired.";
