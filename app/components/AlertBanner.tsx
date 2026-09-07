import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  PauseCircleIcon,
  XCircleIcon,
  XMarkIcon,
} from 'react-native-heroicons/outline';

export type AlertVariant = 'error' | 'warning' | 'success' | 'info' | 'neutral';

interface AlertBannerProps {
  variant: AlertVariant;
  title: string;
  description?: string;
  onDismiss: () => void;
  style?: StyleProp<ViewStyle>;
}

// GRRUNCH DS mobile alert banner (Figma "Mobile Alert Banners" spec,
// iOS Platform column -- node 4076-104), replacing the ad-hoc plain-grey
// statusBanner View that login.tsx and location.tsx each had their own
// copy of. Icon + strong color are per-variant; description uses a muted
// tint of the same hue rather than plain grey, matching the spec (title
// and body are both tinted, not just the icon).
//
// The spec's dismiss X is tinted to match the row's accent, not neutral
// grey -- kept that instead of the old fixed '#888' so it doesn't look
// disconnected from the banner it's closing.
const VARIANTS: Record<AlertVariant, { bg: string; strong: string; muted: string; Icon: typeof XCircleIcon }> = {
  error: { bg: '#FDECEC', strong: '#B42318', muted: '#9B4A43', Icon: XCircleIcon },
  warning: { bg: '#FFF4E5', strong: '#93450B', muted: '#8A6A4A', Icon: ExclamationTriangleIcon },
  success: { bg: '#E8F5E9', strong: '#1E7B34', muted: '#4F7358', Icon: CheckCircleIcon },
  info: { bg: '#E8F1FE', strong: '#1456B0', muted: '#4A6B8A', Icon: InformationCircleIcon },
  neutral: { bg: '#F2F2F2', strong: '#3C3C3C', muted: '#6B6B6B', Icon: PauseCircleIcon },
};

export function AlertBanner({ variant, title, description, onDismiss, style }: AlertBannerProps) {
  const { bg, strong, muted, Icon } = VARIANTS[variant];

  return (
    <View style={[styles.banner, { backgroundColor: bg }, style]}>
      <Icon size={20} color={strong} style={styles.icon} />
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: strong }]}>{title}</Text>
        {description && <Text style={[styles.description, { color: muted }]}>{description}</Text>}
      </View>
      <Pressable onPress={onDismiss} hitSlop={8}>
        <XMarkIcon size={16} color={strong} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  icon: { marginTop: 1 },
  textBlock: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
  description: { fontSize: 13, lineHeight: 18 },
});
