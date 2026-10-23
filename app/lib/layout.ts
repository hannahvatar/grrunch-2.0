import { Platform, useWindowDimensions } from 'react-native';

// Desktop web breakpoint (2026-10-22, web-launch). Screens with a real
// desktop layout switch at this width; narrower browser windows keep the
// phone layout. Native never counts as desktop, even on an iPad.
export const DESKTOP_MIN_WIDTH = 960;

export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH;
}

// Desktop 12-column grid (Anabelle, 2026-10-22). Page content spans the
// middle 8 columns, leaving 2 empty columns on each side.
export const GRID_COLUMNS = 12;
export const GRID_GUTTER = 24;
export const GRID_MARGIN = 48;
export const GRID_MAX_WIDTH = 1440;

// Width of an `n`-column span for a window `windowWidth` wide.
export function gridSpan(windowWidth: number, n: number): number {
  const container = Math.min(windowWidth, GRID_MAX_WIDTH) - GRID_MARGIN * 2;
  const column = (container - GRID_GUTTER * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
  return n * column + (n - 1) * GRID_GUTTER;
}

// Desktop width for a centered modal card, `columns` grid columns wide
// (the delete-account dialogs use 6, Anabelle 2026-10-23; they otherwise
// stretched across the whole window). Spread onto the card's style; null
// off desktop so the modal keeps its phone sizing.
export function useDesktopModalWidth(columns: number): { width: number } | null {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH;
  return isDesktop ? { width: gridSpan(width, columns) } : null;
}

// Where people land after onboarding / sign-in: the web-only Home tab on
// web (Anabelle, 2026-10-23), Weekly Deals on the iPhone app.
export const HOME_ROUTE = Platform.OS === 'web' ? '/home' : '/best-deals';
