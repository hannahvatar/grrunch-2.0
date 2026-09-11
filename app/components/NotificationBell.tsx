import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BellIcon } from 'react-native-heroicons/outline';

import {
  getTrialDaysLeft,
  getTrialUrgencyTier,
  TRIAL_URGENCY_STYLES,
  useSubscription,
} from '../lib/subscription';

const ACCENT = '#FFA955';
const INK = '#111';

// First real notification source: an active trial. This is deliberately
// scoped to one hardcoded case for now, not a general notifications
// backend/table -- there's nothing else to notify about yet. `key`
// includes the trial's current urgency tier (lib/subscription.tsx), not
// just a flat 'trial' -- so as the trial moves from success -> warning ->
// error it reads as a genuinely new notification and re-prompts, instead
// of staying permanently dismissed once read once (Anabelle, 2026-09-11:
// "the notification should prompt again" at intervals -- matching the
// same thresholds as the progress bar's own color escalation, not a
// separate schedule; badge colors below match that same escalation too).
function useNotifications() {
  const { status, trialEndsAt, isSubscribed } = useSubscription();
  const onTrial = isSubscribed && status === 'trialing';
  const tier = getTrialUrgencyTier(getTrialDaysLeft(status, trialEndsAt));
  return onTrial
    ? [
        {
          key: `trial-${tier}`,
          tier,
          message: "You're on a 30-day free trial. Subscribe now to keep your access once it ends.",
        },
      ]
    : [];
}

// Lives in AppTopBar, next to the profile shortcut -- signed-in only,
// same as that button (a guest has no trial/membership state to notify
// about). The panel is an absolutely-positioned overlay anchored under
// the bell, not a separate route/modal (Anabelle, 2026-09-11: "uncollapse
// a notification panel") -- zIndex/elevation keeps it painting above the
// tab content below AppTopBar rather than being clipped or hidden behind
// it.
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const items = useNotifications();
  // Read state is per-item (keyed, not one flat boolean) so a second
  // notification added later tracks independently -- and in-memory only
  // (component state, not persisted) for this first pass: read status
  // resets on app restart. Reasonable for now since this is still a
  // single always-the-same trial reminder, not something a real
  // notification history needs to survive a relaunch for yet.
  const [readKeys, setReadKeys] = useState<Set<string>>(new Set());

  function markRead(key: string) {
    setReadKeys((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }

  // Bell badge color matches whichever unread item is currently most
  // urgent (in practice there's only ever the one trial notification,
  // but this stays correct if a second notification source is ever
  // added) -- same TRIAL_URGENCY_STYLES the progress bar uses, per
  // Anabelle's "match the color schema... for the notification badges".
  const unreadItems = items.filter((item) => !readKeys.has(item.key));
  const bellUrgency = unreadItems.length > 0 ? TRIAL_URGENCY_STYLES[unreadItems[0].tier] : null;

  return (
    <View>
      <Pressable style={styles.bellButton} onPress={() => setOpen((v) => !v)} hitSlop={8}>
        <BellIcon size={18} color={INK} />
        {bellUrgency && <View style={[styles.badge, { backgroundColor: bellUrgency.strong }]} />}
      </Pressable>
      {open && (
        <View style={styles.panel}>
          {items.length === 0 ? (
            <Text style={styles.emptyText}>No notifications right now.</Text>
          ) : (
            items.map((item, index) => {
              const unread = !readKeys.has(item.key);
              const urgency = TRIAL_URGENCY_STYLES[item.tier];
              return (
                // The whole row marks itself read on tap (not just the
                // Subscribe button) -- "read" and "click" both count, per
                // Anabelle's own phrasing. Subscribe's onPress calls
                // markRead() directly too, rather than relying on the
                // touch bubbling up to this wrapping Pressable, since
                // nested Pressables in RN don't reliably do that.
                <Pressable
                  key={item.key}
                  style={[styles.row, index > 0 && styles.rowDivider]}
                  onPress={() => markRead(item.key)}
                >
                  <View style={styles.rowHeader}>
                    <Text style={[styles.rowText, styles.rowTextFlex]}>{item.message}</Text>
                    {unread && <View style={[styles.itemBadge, { backgroundColor: urgency.strong }]} />}
                  </View>
                  <Pressable
                    style={styles.subscribeButton}
                    onPress={() => {
                      markRead(item.key);
                      setOpen(false);
                      router.push({ pathname: '/upgrade', params: { reason: 'keep your access' } });
                    }}
                  >
                    <Text style={styles.subscribeButtonText}>Subscribe</Text>
                  </Pressable>
                </Pressable>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Same white-fill/1.5px-INK-border tertiary circle as AppTopBar's own
  // profileButton, sitting right next to it.
  bellButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // backgroundColor set inline per urgency tier (TRIAL_URGENCY_STYLES,
  // lib/subscription.tsx) -- same colors as MembershipStatus.tsx's
  // progress bar, not a fixed red.
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  panel: {
    position: 'absolute',
    top: '100%',
    // -42, not 0 -- this view is only as wide as the bell button itself
    // (32pt), but the profile circle sits to its right (32pt + 10pt gap,
    // see AppTopBar's signedInButtons); right:0 would anchor the panel to
    // the bell's own edge, undershooting the true screen margin by that
    // 42pt and eating into the title/gear icon to its left instead.
    right: -42,
    marginTop: 10,
    width: 280,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 14,
    padding: 14,
    zIndex: 100,
    elevation: 10,
  },
  emptyText: { fontSize: 13, color: '#888' },
  row: { gap: 10 },
  rowDivider: { borderTopWidth: 1, borderTopColor: '#eee', marginTop: 10, paddingTop: 10 },
  rowHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowText: { fontSize: 16, lineHeight: 22, color: INK },
  rowTextFlex: { flex: 1 },
  // Same dot as the bell's own badge, same inline-per-tier color -- no
  // border here since it's not sitting on a white circle edge the way
  // that one is. marginTop roughly centers it on the message's first
  // line instead of its full (multi-line) height.
  itemBadge: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  // Same compact ACCENT pill as profile.tsx's own upgradeRowButton (the
  // "Choose your own stores" upsell row) -- alignSelf:'flex-start' keeps
  // it sized to its own content instead of stretching full-width.
  subscribeButton: {
    alignSelf: 'flex-start',
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  subscribeButtonText: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
});
