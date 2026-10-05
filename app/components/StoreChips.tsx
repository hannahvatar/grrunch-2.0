import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckIcon } from 'react-native-heroicons/outline';

import { STORE_CHAINS, type StoreFilterScope, useStoreFilter } from '../lib/storeFilter';
import { StoreFilterNoticeModal } from './StoreFilterNoticeModal';

const INK = '#111';

// One chip per chain. `scope` picks the page's own selection in
// lib/storeFilter.tsx (Weekly Deals and Meals are independent). The
// first unselect on a device goes through that page's
// StoreFilterNoticeModal; "Keep all stores" leaves it selected.
export function StoreChips({ scope }: { scope: StoreFilterScope }) {
  const { isHidden, toggleChain, noticeSeen, markNoticeSeen } = useStoreFilter(scope);
  const [pendingChain, setPendingChain] = useState<string | null>(null);

  function handlePress(chain: string) {
    if (!isHidden(chain) && !noticeSeen) {
      setPendingChain(chain);
      return;
    }
    toggleChain(chain);
  }

  return (
    <>
      <StoreFilterNoticeModal
        scope={scope}
        visible={pendingChain !== null}
        onConfirm={() => {
          if (pendingChain) toggleChain(pendingChain);
          setPendingChain(null);
          markNoticeSeen();
        }}
        onCancel={() => setPendingChain(null)}
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
