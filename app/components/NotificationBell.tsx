import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BellIcon } from 'react-native-heroicons/outline';

import { useSubscription } from '../lib/subscription';

const ACCENT = '#FFA955';
const INK = '#111';
const ERROR = '#D0342C';

// First real notification source: an active trial. This is deliberately
// scoped to one hardcoded case for now, not a general notifications
// backend/table -- there's nothing else to notify about yet, and no
// read/unread persistence (the badge just reflects "is there currently
// something worth surfacing", recomputed live from useSubscription(),
// not a dismissible state). Add real entries here (or a proper list)
// once there's a second kind of notification to show.
function useNotifications() {
  const { status, isSubscribed } = useSubscription();
  const onTrial = isSubscribed && status === 'trialing';
  return {
    hasActive: onTrial,
    items: onTrial
      ? [
          {
            key: 'trial',
            message: "You're on a 30-day free trial. Subscribe now to keep your access once it ends.",
          },
        ]
      : [],
  };
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
  const { hasActive, items } = useNotifications();

  return (
    <View>
      <Pressable style={styles.bellButton} onPress={() => setOpen((v) => !v)} hitSlop={8}>
        <BellIcon size={18} color={INK} />
        {hasActive && <View style={styles.badge} />}
      </Pressable>
      {open && (
        <View style={styles.panel}>
          {items.length === 0 ? (
            <Text style={styles.emptyText}>No notifications right now.</Text>
          ) : (
            items.map((item, index) => (
              <View key={item.key} style={[styles.row, index > 0 && styles.rowDivider]}>
                <Text style={styles.rowText}>{item.message}</Text>
                <Pressable
                  onPress={() => {
                    setOpen(false);
                    router.push({ pathname: '/upgrade', params: { reason: 'keep your access' } });
                  }}
                >
                  <Text style={styles.rowLink}>Subscribe</Text>
                </Pressable>
              </View>
            ))
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
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ERROR,
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
  rowText: { fontSize: 13, lineHeight: 19, color: INK },
  rowLink: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: ACCENT },
});
