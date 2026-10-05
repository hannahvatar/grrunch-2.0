import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckIcon } from 'react-native-heroicons/outline';

import { STORE_CHAINS, useStoreFilter } from '../lib/storeFilter';
import { StoreFilterNoticeModal } from './StoreFilterNoticeModal';

const INK = '#111';

// One chip per chain, on Weekly Deals, Meals and My list -- all three
// share one selection (lib/storeFilter.tsx). Turning a store off always
// goes through StoreFilterNoticeModal, which nudges toward keeping it;
// turning one back on is immediate. While any store is off, a reminder
// line under the chips offers to add them all back.
export function StoreChips() {
  const { hiddenChains, isHidden, toggleChain, showAllChains } = useStoreFilter();
  const [pendingChain, setPendingChain] = useState<string | null>(null);
  const offCount = hiddenChains.size;

  function handlePress(chain: string) {
    if (isHidden(chain)) toggleChain(chain);
    else setPendingChain(chain);
  }

  return (
    <View style={styles.wrap}>
      <StoreFilterNoticeModal
        chain={pendingChain}
        onKeep={() => setPendingChain(null)}
        onTurnOff={() => {
          if (pendingChain) toggleChain(pendingChain);
          setPendingChain(null);
        }}
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
      {offCount > 0 && (
        <View style={styles.reminder}>
          <Text style={styles.reminderText}>
            {offCount} store{offCount === 1 ? '' : 's'} off · You may be missing lower prices
          </Text>
          <Pressable onPress={showAllChains} hitSlop={12}>
            <Text style={styles.reminderLink}>Add all stores back</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
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
  reminder: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 2 },
  reminderText: { fontSize: 13, color: INK },
  reminderLink: {
    fontSize: 13,
    color: INK,
    fontWeight: '700',
    fontFamily: 'OpenSans_700Bold',
    textDecorationLine: 'underline',
  },
});
