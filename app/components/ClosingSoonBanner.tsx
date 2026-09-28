import { StyleSheet, Text, View } from 'react-native';
import { ClockIcon } from 'react-native-heroicons/outline';

import { useClosingCountdown } from '../lib/liveWeek';

const ACCENT = '#FFA955';
const INK = '#111';

// Heads-up before the weekly close (Anabelle, 2026-09-28: "from Wednesday
// 11pm ... a top banner with a small countdown that tell the user that in
// an hour everything will wipe"). Pinned above the scrolling content on
// Meals, Weekly Deals and My list; renders nothing outside that last hour.
function formatLeft(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function ClosingSoonBanner() {
  const left = useClosingCountdown();
  if (left === null) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <ClockIcon size={22} color={INK} strokeWidth={2} />
      <View style={styles.textBlock}>
        <Text style={styles.title}>
          This week ends in <Text style={styles.time}>{formatLeft(left)}</Text>
        </Text>
        <Text style={styles.body}>Meals, deals and your grocery list reset at 11:59 pm.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 16,
  },
  textBlock: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  time: { fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', fontVariant: ['tabular-nums'] },
  body: { fontSize: 13, lineHeight: 18, color: INK },
});
