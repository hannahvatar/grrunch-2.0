import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { GRID_GUTTER, GRID_MARGIN, GRID_MAX_WIDTH, gridSpan } from '../lib/layout';
import { GrrunchMascot } from './GrrunchMascot';

const INK = '#111';
const MIN_SPAN_WIDTH = 280;

// Shared desktop web layout for the first-run flow (onboarding, terms,
// login, location, stores -- 2026-10-22): brand header, then two columns,
// an illustration panel on the left and the screen's own content on the
// right. With `grid` (onboarding and login only, per Anabelle), the
// content instead sits centered on the middle 8 of 12 grid columns, split
// 4 + 4. Only rendered when useIsDesktop() is true; each screen keeps its
// phone layout otherwise.
//
// `art` is drawn at its natural size (artWidth x artHeight) and scaled to
// fill `artFill` of the panel, measured on layout, so it never clips on a
// smaller laptop. Pass `aside` instead of `art` for plain left-column
// content with no panel (login's headline, per Anabelle 2026-10-22), or
// neither for a single centered column.
export function DesktopAuthShell({
  art,
  aside,
  artWidth = 1,
  artHeight = 1,
  artFill = 0.82,
  artPanel = true,
  headerRight,
  grid = false,
  span,
  children,
}: {
  art?: ReactNode;
  aside?: ReactNode;
  artWidth?: number;
  artHeight?: number;
  artFill?: number;
  // Outlined cream panel behind the art; onboarding turns it off so the
  // animation sits straight on the page (Anabelle, 2026-10-22).
  artPanel?: boolean;
  headerRight?: ReactNode;
  grid?: boolean;
  span?: number;
  children: ReactNode;
}) {
  const [scale, setScale] = useState(1);
  const { width } = useWindowDimensions();
  const half = art || aside;
  // Grid pages get fixed column widths; the others size by flex (below).
  const mainWidth = grid ? { width: gridSpan(width, 8) } : styles.mainFlex;
  const halfWidth = grid ? { width: gridSpan(width, 4) } : styles.halfFlex;
  // `span` = a single centered column `span` grid columns wide (login),
  // floored so its buttons stay usable on a small laptop.
  const contentWidth = grid
    ? half
      ? halfWidth
      : span
        ? { width: Math.max(gridSpan(width, span), MIN_SPAN_WIDTH) }
        : null
    : styles.contentFlex;
  return (
    <LinearGradient colors={['#fff', '#FFEAD4']} style={styles.gradient}>
      <View style={[styles.page, !grid && styles.pageNarrow]}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <GrrunchMascot size={44} showCrumbs={false} />
            <Text style={styles.wordmark}>GRRUNCH</Text>
          </View>
          {headerRight}
        </View>

        <View style={[styles.main, mainWidth, !half && styles.mainCentered]}>
          {aside && <View style={halfWidth}>{aside}</View>}
          {art && (
            <View
              style={[styles.artPanel, halfWidth, !artPanel && styles.artPanelPlain]}
              onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                setScale(Math.min(width / artWidth, height / artHeight) * artFill);
              }}
            >
              <View style={{ transform: [{ scale }] }}>{art}</View>
            </View>
          )}

          <ScrollView
            style={[styles.contentScroll, contentWidth]}
            contentContainerStyle={styles.content}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </LinearGradient>
  );
}

// Text styles shared by the desktop versions of these screens. Type rule
// (Anabelle, 2026-10-22): input and body text 16px, field labels and
// small captions 14px; button text keeps its own size.
export const desktopText = StyleSheet.create({
  headline: {
    fontSize: 44,
    lineHeight: 52,
    fontWeight: '800',
    fontFamily: 'OpenSans_800ExtraBold',
    color: INK,
    marginBottom: 20,
  },
  body: { fontSize: 16, lineHeight: 24, color: INK, marginBottom: 32 },
  label: { fontSize: 14 },
  centered: { textAlign: 'center' },
});

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  page: { flex: 1, width: '100%', maxWidth: GRID_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: GRID_MARGIN },
  // Non-grid pages: the original layout (1200 max, 72px between halves,
  // content column capped at 460).
  pageNarrow: { maxWidth: 1200 },
  mainFlex: { width: '100%', gap: 72 },
  mainCentered: { justifyContent: 'center' },
  halfFlex: { flex: 1 },
  // Explicit flexGrow: contentScroll's flexGrow 0 would beat a `flex` shorthand.
  contentFlex: { flexGrow: 1, flexShrink: 1, flexBasis: 0, maxWidth: 460 },
  header: {
    height: 96,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  wordmark: { fontSize: 22, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK, letterSpacing: 1 },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: GRID_GUTTER,
    paddingBottom: 96,
    minHeight: 0,
  },
  artPanel: {
    aspectRatio: 1.25,
    maxHeight: 520,
    borderRadius: 32,
    backgroundColor: '#FFF6EC',
    borderWidth: 2,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  artPanelPlain: { borderWidth: 0, backgroundColor: 'transparent' },
  // ScrollView grows to fill the row by default, which overrode the grid
  // widths; contentFlex (non-grid pages) turns growing back on.
  contentScroll: { maxHeight: '100%', flexGrow: 0 },
  content: { flexGrow: 1, justifyContent: 'center', paddingVertical: 8 },
});
