import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckIcon } from 'react-native-heroicons/outline';

import { STORE_CHAINS, type StoreChipsPage, useStoreFilter } from '../lib/storeFilter';
import { useSubscription } from '../lib/subscription';
import { StoreFilterNoticeModal, StoreReminderModal } from './StoreFilterNoticeModal';

const INK = '#111';

// One chip per chain, on Weekly Deals, Meals and My list -- all three
// share one selection (lib/storeFilter.tsx). Turning a store off always
// goes through StoreFilterNoticeModal, which nudges toward keeping it;
// turning one back on is immediate. When a page opens with stores off,
// StoreReminderModal shows once per page per session; the page where a
// store was just turned off counts as already reminded.
//
// Members only (Anabelle, 2026-10-06: "Non member should not be able to
// deselect stores chips"): a non-member's tap opens /upgrade instead,
// and every store is forced back on if a membership lapses mid-session.
export function StoreChips({ page }: { page: StoreChipsPage }) {
  const { hiddenChains, isHidden, toggleChain, showAllChains, wasReminded, markReminded } = useStoreFilter();
  const { isSubscribed, loading: subscriptionLoading } = useSubscription();
  const locked = !subscriptionLoading && !isSubscribed;
  const [pendingChain, setPendingChain] = useState<string | null>(null);
  const [showReminder, setShowReminder] = useState(false);
  const offCount = hiddenChains.size;

  useEffect(() => {
    if (locked && offCount > 0) showAllChains();
  }, [locked, offCount, showAllChains]);

  useFocusEffect(
    useCallback(() => {
      if (offCount > 0 && !locked && !wasReminded(page)) {
        markReminded(page);
        setShowReminder(true);
      }
    }, [offCount, locked, page, wasReminded, markReminded])
  );

  function handlePress(chain: string) {
    if (locked) {
      router.push({ pathname: '/upgrade', params: { reason: 'choose which stores you see' } });
      return;
    }
    if (isHidden(chain)) toggleChain(chain);
    else setPendingChain(chain);
  }

  return (
    <>
      <StoreFilterNoticeModal
        chain={pendingChain}
        onKeep={() => setPendingChain(null)}
        onTurnOff={() => {
          markReminded(page);
          if (pendingChain) toggleChain(pendingChain);
          setPendingChain(null);
        }}
      />
      <StoreReminderModal
        visible={showReminder}
        offCount={offCount}
        onAddAllBack={() => {
          showAllChains();
          setShowReminder(false);
        }}
        onKeepSelection={() => setShowReminder(false)}
      />
      <View style={styles.chips}>
        {STORE_CHAINS.map((chain) => {
          const selected = !isHidden(chain);
          return (
            <Pressable
              key={chain}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => handlePress(chain)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
            >
              {selected && <CheckIcon size={14} color="#fff" strokeWidth={2.5} />}
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{chain}</Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 44,
    justifyContent: 'center',
  },
  // Same INK-fill "on" state as Weekly Deals' addIconButtonActive.
  chipSelected: { backgroundColor: INK },
  chipText: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  chipTextSelected: { color: '#fff' },
});
