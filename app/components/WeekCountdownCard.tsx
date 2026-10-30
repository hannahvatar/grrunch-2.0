import { StyleSheet, Text, View } from 'react-native';

import { useWeekDaysLeft, useWeekValidityLabel } from '../lib/liveWeek';
import { ProgressBar } from './ProgressBar';

const INK = '#111';

// This week's dates and days-left bar in a white card. First on Home
// (Anabelle, 2026-10-30: "I want this in a white container"), then the
// same on Weekly Deals ("Make the same progress that there is on the hp").
// Fills its parent's width, so it spans the page's 8 grid columns.
export function WeekCountdownCard() {
  const weekValidity = useWeekValidityLabel();
  const weekDaysLeft = useWeekDaysLeft();
  if (!weekValidity && !weekDaysLeft) return null;
  return (
    <View style={styles.card}>
      {weekValidity && <Text style={styles.validity}>{weekValidity}</Text>}
      {/* The time-left bar under the dates, so the week reads as a short
          window (Anabelle, 2026-10-26). */}
      {weekDaysLeft && (
        <View style={styles.countdown}>
          <ProgressBar
            progress={weekDaysLeft.daysLeft / weekDaysLeft.totalDays}
            label={weekDaysLeft.daysLeft <= 1 ? 'Last day!' : `${weekDaysLeft.daysLeft} days left`}
            tier={weekDaysLeft.daysLeft <= 1 ? 'error' : weekDaysLeft.daysLeft <= 3 ? 'warning' : 'success'}
            labelColor={INK}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 12 },
  // All text in the card is black (Anabelle, 2026-10-30).
  validity: { fontSize: 14, color: INK },
  countdown: { marginTop: 8 },
});
