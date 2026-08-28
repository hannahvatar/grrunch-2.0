import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { XMarkIcon } from 'react-native-heroicons/outline';

import { CategoryToggleRow } from '../components/CategoryToggleRow';
import { useAuth } from '../lib/auth';
import {
  CATEGORY_LABELS,
  CategoryPrefs,
  DEFAULT_CATEGORY_PREFS,
  fetchNotificationPrefs,
  saveNotificationPrefs,
} from '../lib/notificationPrefs';

const ACCENT = '#FFA955';
const INK = '#111';

// Its own real screen -- reads/writes the `push` slice of
// public.users.notification_prefs (see lib/notificationPrefs.ts), leaving
// the `email`/`emailSubscribed` slices untouched on save so this screen
// and notifications-email.tsx never clobber each other's changes.
export default function NotificationsPushScreen() {
  const { session, isGuest, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<CategoryPrefs>(DEFAULT_CATEGORY_PREFS);
  const [draft, setDraft] = useState<CategoryPrefs>(DEFAULT_CATEGORY_PREFS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // This screen is only ever meant to be reached via notifications.tsx's
  // own guest gate -- a guest landing here directly (deep link, back/
  // forward) would otherwise spin on fetchNotificationPrefs forever,
  // since there's no session to fetch for. Bounce back rather than show
  // a dead-end spinner.
  useEffect(() => {
    if (!authLoading && isGuest) {
      router.replace('/notifications');
    }
  }, [authLoading, isGuest]);

  useEffect(() => {
    if (!session) return;
    fetchNotificationPrefs(session.user.id).then(({ prefs }) => {
      setSaved(prefs.push);
      setDraft(prefs.push);
      setLoading(false);
    });
  }, [session]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function toggle(key: keyof CategoryPrefs) {
    setDraft((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSave() {
    if (!session) return;
    setSaving(true);
    setError(null);
    const { prefs: current } = await fetchNotificationPrefs(session.user.id);
    const { error: saveError } = await saveNotificationPrefs(session.user.id, session.user.email ?? null, {
      ...current,
      push: draft,
    });
    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    setSaved(draft);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Push notifications</Text>
        <Pressable style={styles.closeButton} onPress={() => router.back()} hitSlop={8}>
          <XMarkIcon size={18} color={INK} />
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator style={styles.loading} color={INK} />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.heading}>Categories</Text>
            {CATEGORY_LABELS.map((c) => (
              <CategoryToggleRow
                key={c.key}
                title={c.title}
                description={c.description}
                checked={draft[c.key]}
                onToggle={() => toggle(c.key)}
              />
            ))}
            {error && <Text style={styles.errorText}>{error}</Text>}
          </ScrollView>
          <View style={styles.footer}>
            <Pressable
              style={[styles.saveButton, (!dirty || saving) && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={!dirty || saving}
            >
              {saving ? (
                <ActivityIndicator color={INK} />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFEAD4' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 60,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold' },
  loading: { marginTop: 40 },
  content: { paddingHorizontal: 24, paddingBottom: 24 },
  heading: { fontSize: 20, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK, marginBottom: 8 },
  errorText: { fontSize: 13, color: '#D0342C', marginTop: 12 },
  footer: { padding: 24, paddingTop: 0 },
  saveButton: {
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 26,
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { fontSize: 16, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
});
