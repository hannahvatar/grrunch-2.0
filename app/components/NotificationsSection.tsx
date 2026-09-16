import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { useAuth } from '../lib/auth';
import {
  CATEGORY_LABELS,
  CategoryPrefs,
  DEFAULT_NOTIFICATION_PREFS,
  fetchNotificationPrefs,
  NotificationPrefs,
  saveNotificationPrefs,
} from '../lib/notificationPrefs';
import { CategoryToggleRow } from './CategoryToggleRow';
import { SignInOrTrialPrompt } from './SignInOrTrialPrompt';

const ACCENT = '#FFA955';
const INK = '#111';
const ERROR = '#D0342C';

// Profile's Notifications accordion content (Anabelle, 2026-09-15:
// "Dont nest Push notification into Notification. Make it Notification
// only") -- was two separate rows ("Push notifications"/"Email"), each
// pushing its own dedicated screen (notifications-push.tsx/
// notifications-email.tsx), themselves only just moved here from
// Settings in the same session. That was a real extra nesting level on
// top of the accordion Profile already added; this merges both
// channels into one flat section instead, same "no drill-down, just
// show the real thing inline" treatment as Profile's own Manage
// account section (ManageAccountSection.tsx). One combined Save now
// writes the whole notification_prefs object in a single call, instead
// of each screen's own fetch-current/merge-in-just-my-slice dance to
// avoid clobbering the other channel's settings -- saveNotificationPrefs
// already always took the full NotificationPrefs shape, so this is
// simpler, not just flatter.
export function NotificationsSection() {
  const { isGuest } = useAuth();

  if (isGuest) {
    return (
      <View style={styles.wrap}>
        <SignInOrTrialPrompt reason="set your notification preferences" />
      </View>
    );
  }

  return <NotificationsForm />;
}

function NotificationsForm() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [draft, setDraft] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    fetchNotificationPrefs(session.user.id).then(({ prefs }) => {
      setSaved(prefs);
      setDraft(prefs);
      setLoading(false);
    });
  }, [session]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function togglePush(key: keyof CategoryPrefs) {
    setDraft((prev) => ({ ...prev, push: { ...prev.push, [key]: !prev.push[key] } }));
  }
  function toggleEmailCategory(key: keyof CategoryPrefs) {
    setDraft((prev) => ({ ...prev, email: { ...prev.email, [key]: !prev.email[key] } }));
  }

  async function handleSave() {
    if (!session) return;
    setSaving(true);
    setError(null);
    const { error: saveError } = await saveNotificationPrefs(session.user.id, session.user.email ?? null, draft);
    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    setSaved(draft);
  }

  if (loading) {
    return (
      <View style={styles.wrap}>
        <ActivityIndicator color={INK} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.sectionCard}>
        <Text style={styles.subheading}>Push</Text>
        {CATEGORY_LABELS.map((c) => (
          <CategoryToggleRow
            key={c.key}
            title={c.title}
            description={c.description}
            checked={draft.push[c.key]}
            onToggle={() => togglePush(c.key)}
          />
        ))}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.subheading}>Email</Text>
        <View style={styles.subscribedRow}>
          <Text style={styles.subscribedText}>Subscribed</Text>
          <Switch
            value={draft.emailSubscribed}
            onValueChange={(v) => setDraft((prev) => ({ ...prev, emailSubscribed: v }))}
            trackColor={{ false: '#ccc', true: INK }}
            thumbColor="#fff"
          />
        </View>
        {CATEGORY_LABELS.map((c) => (
          <CategoryToggleRow
            key={c.key}
            title={c.title}
            description={c.description}
            checked={draft.email[c.key]}
            onToggle={() => toggleEmailCategory(c.key)}
            disabled={!draft.emailSubscribed}
          />
        ))}
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}
      <Pressable
        style={[styles.saveButton, (!dirty || saving) && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={!dirty || saving}
      >
        {saving ? <ActivityIndicator color={INK} /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, gap: 16 },
  // Same borderless white card as ManageAccountSection's sectionCard --
  // Push and Email each get their own (Anabelle, 2026-09-16: "Push
  // notifs and email notfi should be in their respective white
  // containers"), replacing the plain hairline divider between them.
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
  },
  subheading: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK, marginBottom: 4 },
  subscribedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  subscribedText: { fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  errorText: { fontSize: 13, color: ERROR, marginTop: 12 },
  saveButton: {
    marginTop: 18,
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
