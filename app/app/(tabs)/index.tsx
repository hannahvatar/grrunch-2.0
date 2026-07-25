import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

// Landing page — architecture.md section 2.1.
// Two honest sections pulled from `curated_deals`: "Best Deals" (>=40% off)
// and "Worth It" (15-39% off). No login/store selection required here —
// each section must show an empty state rather than being backfilled when
// nothing clears its threshold this week.

export default function LandingScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Section
        title="Best Deals"
        subtitle="Genuinely significant margins this week"
        emptyState="Nothing this outstanding this week — check back soon."
      />
      <Section
        title="Worth It"
        subtitle="Solid deals, just under the Best Deals bar"
        emptyState="No Worth It picks this week — check back soon."
      />
      <View style={styles.cta}>
        <Text style={styles.ctaTitle}>Want a full meal plan built around deals like this?</Text>
        <Link href="/plan/setup" style={styles.ctaLink}>
          Build my meal plan
        </Link>
      </View>
    </ScrollView>
  );
}

function Section({
  title,
  subtitle,
  emptyState,
}: {
  title: string;
  subtitle: string;
  emptyState: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>{emptyState}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 24 },
  section: { gap: 4 },
  sectionTitle: { fontSize: 22, fontWeight: '700' },
  sectionSubtitle: { fontSize: 14, color: '#666' },
  emptyState: {
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F2F2F2',
  },
  emptyStateText: { color: '#666' },
  cta: {
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#E6F4FE',
    gap: 8,
  },
  ctaTitle: { fontSize: 16, fontWeight: '600' },
  ctaLink: { fontSize: 16, fontWeight: '700', color: '#0A7EA4' },
});
