// BC time without relying on the device's time-zone data.
//
// BC stopped changing its clocks in 2026: it stayed on UTC-7 when it would
// have fallen back on Nov 1. Not every runtime knows that yet (Supabase's
// Postgres and some JS engines still think Vancouver went to UTC-8), so
// the app, the database and the flyer fetch all use a fixed UTC-7 instead
// of 'America/Vancouver' (Anabelle, 2026-11-05: dev-deals showed the
// Thursday noon go-live as 1 pm).
export const BC_UTC_OFFSET_HOURS = -7;

// The BC wall-clock time, as a Date whose UTC fields (getUTCHours,
// getUTCDay, toISOString...) read as BC time. Format it with
// timeZone: 'UTC'.
export function bcWallClock(date: Date): Date {
  return new Date(date.getTime() + BC_UTC_OFFSET_HOURS * 60 * 60 * 1000);
}

// e.g. "Thu, Nov 5, 12:00 p.m." in BC time.
export function formatBCDateTime(iso: string): string {
  return bcWallClock(new Date(iso)).toLocaleString('en-CA', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
