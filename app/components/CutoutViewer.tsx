import { Image, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { XMarkIcon } from 'react-native-heroicons/outline';

const INK = '#111';

// Full-screen view of a flyer cutout, so the small print on the deal is
// readable. Started in dev-deals (Anabelle: "click on the image and see a
// close up preview of the cutout"), now on every deal card in recipes and
// the grocery list too (Anabelle, 2026-10-01). It fills the screen; pinch
// (or double-tap) zooms further using ScrollView's own zoom, which is
// iOS-only, so elsewhere it stays at full-screen size. The X closes it.
export function CutoutViewer({ uri, visible, onClose }: { uri: string; visible: boolean; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewer}>
        <ScrollView
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
        </ScrollView>
        <Pressable style={styles.close} onPress={onClose} hitSlop={12} accessibilityLabel="Close">
          <XMarkIcon size={22} color={INK} strokeWidth={2} />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  viewer: { flex: 1, backgroundColor: '#000' },
  close: {
    position: 'absolute',
    top: 60,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 999,
    padding: 10,
  },
});
