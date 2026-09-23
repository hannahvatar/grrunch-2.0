import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from './auth';
import { fetchProfile } from './profile';

// Grrunch is British Columbia only for now (Anabelle, 2026-09-23: "the
// app for now will be British Columbia only"). The App Store can only
// restrict by country (the subscriptions are Canada-only there), so the
// province-level limit has to live in the app itself -- this file is the
// one place that decides "is this person in BC?", used by onboarding's
// location step (app/location.tsx) and the subscribe screen
// (app/upgrade.tsx).
//
// Same simplified BC border as supabase/functions/search-stores/index.ts's
// BC_POLYGON (see that file for why a polygon and not a bounding box: a
// box can't tell Calgary apart from Cranbrook/Fernie). Duplicated rather
// than imported since that file is a Deno Edge Function -- keep the two
// in sync if the border ever changes.
const BC_POLYGON: Array<[lng: number, lat: number]> = [
  [-139.1, 60.0],
  [-120.0, 60.0],
  [-120.0, 54.0],
  [-118.7, 52.8],
  [-116.8, 51.7],
  [-115.9, 50.7],
  [-115.2, 49.7],
  [-114.4, 49.0],
  [-123.3, 49.0],
  [-123.2, 48.7],
  [-123.2, 48.25],
  [-124.0, 48.3],
  [-125.0, 48.5],
  [-128.0, 50.0],
  [-133.0, 54.0],
  [-136.0, 58.0],
];

// Ray-casting point-in-polygon, identical to search-stores'
// isWithinServiceArea.
export function isInBC(lat: number, lng: number): boolean {
  let inside = false;
  for (let i = 0, j = BC_POLYGON.length - 1; i < BC_POLYGON.length; j = i++) {
    const [xi, yi] = BC_POLYGON[i];
    const [xj, yj] = BC_POLYGON[j];
    const crossesLatitude = yi > lat !== yj > lat;
    if (crossesLatitude && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Every BC postal code starts with V (Canada Post's forward sortation
// areas are assigned by province) -- the first letter alone settles it.
export function isBCPostalCode(postalCode: string): boolean {
  return postalCode.trim().toUpperCase().startsWith('V');
}

// 'in' / 'outside': settled, from the postal code if the account has one,
// otherwise from device location. 'unknown': no postal code and location
// isn't available (not granted, or the lookup failed) -- the caller asks
// for one of the two rather than guessing either way.
export type ServiceAreaStatus = 'checking' | 'in' | 'outside' | 'unknown';

// Postal code wins over device location when both exist -- it's what the
// person told us about where they live, where GPS is just where they
// happen to be standing (e.g. a Vancouver member on a trip to Calgary).
// Never prompts for location permission on its own: that's what
// checkWithLocation() is for, behind an explicit tap.
export function useServiceArea() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [status, setStatus] = useState<ServiceAreaStatus>('checking');
  // The device position behind a location-based answer (null when the
  // postal code decided it) -- passed along to the waitlist if they join.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  // Location was denied and iOS/Android won't show the prompt again
  // (canAskAgain false) -- only Settings can turn it back on, so the
  // caller offers "Open Settings" instead of a button that silently does
  // nothing (caught testing on the simulator, 2026-09-23).
  const [locationBlocked, setLocationBlocked] = useState(false);
  // Bumped when the app comes back to the foreground, to re-run the
  // check after a trip to Settings.
  const [refreshKey, setRefreshKey] = useState(0);

  const statusFromLocation = useCallback(async (askPermission: boolean): Promise<ServiceAreaStatus> => {
    try {
      const permission = askPermission
        ? await Location.requestForegroundPermissionsAsync()
        : await Location.getForegroundPermissionsAsync();
      setLocationBlocked(permission.status !== 'granted' && !permission.canAskAgain);
      if (permission.status !== 'granted') {
        return 'unknown';
      }
      const position =
        (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({}));
      setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
      return isInBC(position.coords.latitude, position.coords.longitude) ? 'in' : 'outside';
    } catch {
      return 'unknown';
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus('checking');
      if (userId) {
        const { profile } = await fetchProfile(userId);
        if (profile?.postalCode) {
          if (!cancelled) setStatus(isBCPostalCode(profile.postalCode) ? 'in' : 'outside');
          return;
        }
      }
      const fromLocation = await statusFromLocation(false);
      if (!cancelled) setStatus(fromLocation);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, statusFromLocation, refreshKey]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setRefreshKey((key) => key + 1);
    });
    return () => subscription.remove();
  }, []);

  // Explicit "Use my location" tap from the 'unknown' state -- the one
  // path here allowed to show the system permission prompt.
  const checkWithLocation = useCallback(async () => {
    setStatus('checking');
    setStatus(await statusFromLocation(true));
  }, [statusFromLocation]);

  return { status, coords, locationBlocked, checkWithLocation };
}
