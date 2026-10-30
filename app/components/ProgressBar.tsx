import { StyleSheet, Text, View } from 'react-native';

import { TRIAL_URGENCY_STYLES, type TrialUrgencyTier } from '../lib/subscription';

// The warning tier in orange instead of the DS's brown, on these bars
// only (Anabelle, 2026-10-26: "use this orange: FF7A2A", the same orange
// as the "Fair price" badge text).
const BAR_COLORS: Record<TrialUrgencyTier, { fill: string; label: string }> = {
  success: { fill: TRIAL_URGENCY_STYLES.success.strong, label: TRIAL_URGENCY_STYLES.success.strong },
  // Label a shade darker than the fill so the small text reads on peach.
  warning: { fill: '#FF7A2A', label: '#E8621A' },
  error: { fill: TRIAL_URGENCY_STYLES.error.strong, label: TRIAL_URGENCY_STYLES.error.strong },
};

// Time-left bar: a track filled to `progress` (0-1) in the urgency
// tier's color, with its label on the right ("5 days left"). First built
// for the free trial in MembershipStatus.tsx; Home reuses it under the
// week's dates (Anabelle, 2026-10-26: "stress that this is valid for a
// short time").
export function ProgressBar({
  progress,
  label,
  tier,
  trackColor = '#F0F0F0',
}: {
  progress: number;
  label: string;
  tier: TrialUrgencyTier;
  // Grey on white cards (the trial card); Home passes white for its peach
  // page (Anabelle, 2026-10-26: "back in white").
  trackColor?: string;
}) {
  const clamped = Math.max(0, Math.min(1, progress));
  // Fill and label in the tier's color.
  const colors = BAR_COLORS[tier];
  return (
    <View style={styles.row}>
      <View style={[styles.track, { backgroundColor: trackColor }]}>
        <View style={[styles.fill, { width: `${clamped * 100}%`, backgroundColor: colors.fill }]} />
      </View>
      <Text style={[styles.label, { color: colors.label }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4 },
  label: { fontSize: 12, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
});
