import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { STORE_SECTIONS } from '../lib/groceryListData';

// Shared grocery list content — used both as a modal (Meals tab's "View
// grocery list" button, unchanged) and as the Grocery tab's own full page.
// Pass onClose to get the modal chrome (drag handle + close X); omit it for
// a plain full-page presentation.
export function GroceryListView({ onClose }: { onClose?: () => void }) {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  function toggle(itemKey: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(itemKey)) {
        next.delete(itemKey);
      } else {
        next.add(itemKey);
      }
      return next;
    });
  }

  const totalItems = STORE_SECTIONS.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <View style={styles.container}>
      {onClose && <View style={styles.handle} />}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Grocery list</Text>
          <Text style={styles.subtitle}>
            {totalItems} items · {totalItems} on sale · {STORE_SECTIONS.length} stores
          </Text>
        </View>
        {onClose && (
          <Pressable onPress={onClose}>
            <Text style={styles.closeButton}>✕</Text>
          </Pressable>
        )}
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {STORE_SECTIONS.map((section) => (
          <View key={section.store} style={styles.storeSection}>
            <View style={styles.storeHeaderRow}>
              <Text style={styles.storeName}>{section.store}</Text>
              <Text style={styles.viewFlyer}>View flyer ↗</Text>
            </View>
            {section.items.map((item) => {
              const itemKey = `${section.store}-${item.name}`;
              const isChecked = checked.has(itemKey);
              return (
                <View key={itemKey} style={styles.itemRow}>
                  <Pressable style={styles.checkbox} onPress={() => toggle(itemKey)}>
                    {isChecked && <Text style={styles.checkboxMark}>✓</Text>}
                  </Pressable>
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemName, isChecked && styles.itemNameChecked]}>
                      {item.name}
                    </Text>
                    <Text style={styles.itemQty}>{item.qty}</Text>
                  </View>
                  <Text style={styles.discount}>{item.discountPct}% off</Text>
                  <Text style={styles.iconButton}>↗</Text>
                  <Text style={styles.iconButton}>🗑</Text>
                </View>
              );
            })}
            <Pressable>
              <Text style={styles.addItem}>+ Add item</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
  },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 13, color: '#888', marginTop: 2 },
  closeButton: { fontSize: 20, color: '#999' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 20 },
  storeSection: { gap: 10 },
  storeHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  storeName: { fontSize: 15, fontWeight: '700' },
  viewFlyer: { fontSize: 13, color: '#2C5FD6', fontWeight: '600' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxMark: { fontSize: 12, fontWeight: '700' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15 },
  itemNameChecked: { textDecorationLine: 'line-through', color: '#aaa' },
  itemQty: { fontSize: 12, color: '#aaa' },
  discount: { fontSize: 13, color: '#2C5FD6', fontWeight: '700' },
  iconButton: { fontSize: 14, color: '#999', paddingHorizontal: 4 },
  addItem: { color: '#2C5FD6', fontWeight: '600', fontSize: 14 },
});
