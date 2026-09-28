import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, ScrollView, StyleSheet, Text, View } from 'react-native';

import { nextDropAt, useLiveWeek } from '../lib/liveWeek';
import { CauldronAnimation } from './CauldronAnimation';

// GRRUNCH DS accent, same palette as the onboarding screen (app/index.tsx).
const ACCENT = '#FFA955';
const INK = '#111';

// "New week is coming" state for Meals, Weekly Deals and the grocery list,
// shown between the Wednesday 11:59 pm close and the Thursday 12:00 pm
// publish (lib/liveWeek.ts, Anabelle 2026-09-24). Anabelle, 2026-09-28:
// an excited countdown with an animation like the onboarding screen.
// The same simmering-cauldron animation on every screen (Anabelle, same
// day).
type Screen = 'meals' | 'deals' | 'list';

const COPY: Record<Screen, { headline: string; body: string }> = {
  meals: {
    headline: 'New meals are cooking',
    body: "We're turning this week's best deals into fresh recipes. They drop in:",
  },
  deals: {
    headline: 'Fresh deals are on the way',
    body: "We're scanning the new flyers for the deals actually worth buying. They drop in:",
  },
  list: {
    headline: 'Ready for a fresh list',
    body: "Last week's list is cleared. New meals and deals drop in:",
  },
};

function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// "Thursday at 12:00 pm" in Vancouver time, for the line under the tiles.
function dropLabel(drop: Date): string {
  try {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver', weekday: 'long' }).format(drop);
    const time = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Vancouver',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
      .format(drop)
      .replace(/\./g, '')
      .toLowerCase();
    return `${day} at ${time}`;
  } catch {
    return 'Thursday at 12:00 pm';
  }
}

function Tile({ value, label, highlight }: { value: string; label: string; highlight?: boolean }) {
  // A little hop every time the number changes.
  const hop = useRef(new Animated.Value(0)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || cancelled) return;
      hop.setValue(1);
      Animated.timing(hop, { toValue: 0, duration: 350, easing: Easing.out(Easing.back(3)), useNativeDriver: true }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [value, hop]);
  const scale = hop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const translateY = hop.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });

  return (
    <View style={[styles.tile, highlight && styles.tileHighlight]}>
      <Animated.Text style={[styles.tileValue, { transform: [{ translateY }, { scale }] }]}>{value}</Animated.Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

export function WeekGapState({ screen }: { screen: Screen }) {
  const liveWeek = useLiveWeek();
  const now = useNow();
  const drop = nextDropAt(liveWeek);
  const left = drop ? Math.max(0, drop.getTime() - now) : null;
  const copy = COPY[screen];

  const totalSeconds = left === null ? 0 : Math.floor(left / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  // Countdown finished but the new week hasn't come through yet (the
  // live-week store polls every minute while closed).
  const anyMinute = left !== null && left <= 0;

  return (
    <LinearGradient colors={['#fff', '#FFEAD4']} style={styles.gradient}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.art}>
          <CauldronAnimation active />
        </View>
        <Text style={styles.headline}>{copy.headline}</Text>
        <Text style={styles.body}>{anyMinute ? 'New meals and deals are dropping any minute now.' : copy.body}</Text>

        {left !== null && !anyMinute && (
          <>
            <View style={styles.tiles} accessible accessibilityLabel={`${days > 0 ? `${days} days, ` : ''}${hours} hours, ${minutes} minutes, ${seconds} seconds`}>
              {days > 0 && <Tile value={String(days)} label={days === 1 ? 'day' : 'days'} />}
              <Tile value={pad(hours)} label="hrs" />
              <Tile value={pad(minutes)} label="min" />
              <Tile value={pad(seconds)} label="sec" highlight />
            </View>
            {drop && <Text style={styles.when}>{dropLabel(drop)}</Text>}
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  // Bottom padding clears SupportBubble (fixed right:20/bottom:96), same
  // reasoning as the onboarding screen's bottomBlock.
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 140 },
  art: { alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  headline: {
    fontSize: 24,
    fontWeight: '800',
    fontFamily: 'OpenSans_800ExtraBold',
    color: INK,
    textAlign: 'center',
    marginBottom: 12,
  },
  body: { fontSize: 15, lineHeight: 22, color: INK, textAlign: 'center', marginBottom: 20 },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: {
    width: 72,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 16,
    alignItems: 'center',
  },
  tileHighlight: { backgroundColor: ACCENT },
  tileValue: {
    fontSize: 30,
    fontWeight: '800',
    fontFamily: 'OpenSans_800ExtraBold',
    color: INK,
    fontVariant: ['tabular-nums'],
  },
  tileLabel: { fontSize: 12, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold', color: INK },
  when: { marginTop: 14, fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
});
