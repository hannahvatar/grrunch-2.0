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
