import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { XMarkIcon } from 'react-native-heroicons/outline';

import { useIsDesktop } from '../lib/layout';

const INK = '#111';
// Desktop web: the cutout opens as a centered card at most this wide
// instead of taking over the page (Anabelle, 2026-10-23).
const DESKTOP_MAX_WIDTH = 600;

// Full-screen view of a flyer cutout, so the small print on the deal is
// readable. Started in dev-deals (Anabelle: "click on the image and see a
// close up preview of the cutout"), now on every deal card in recipes and
// the grocery list too (Anabelle, 2026-10-01). It fills the screen; pinch
// (or double-tap) zooms further using ScrollView's own zoom, which is
// iOS-only, so elsewhere it stays at full-screen size. The X closes it.
//
// Desktop web: a centered white card instead, the image at most
// DESKTOP_MAX_WIDTH wide (and never taller than the window allows), with
// a shadow and no dark overlay, same as the list's bottom sheets. Click
// outside the card or the X to close.
export function CutoutViewer({ uri, visible, onClose }: { uri: string; visible: boolean; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const isDesktop = useIsDesktop();
  // The cutout's own proportions, so the desktop card hugs the image.
  const [aspect, setAspect] = useState<number | null>(null);
  useEffect(() => {
    if (!isDesktop || !visible) return;
    Image.getSize(uri, (w, h) => setAspect(w / h), () => setAspect(null));
  }, [isDesktop, visible, uri]);

  if (isDesktop) {
    // Fit within 600px wide and the window's height, keeping proportions.
    const maxWidth = Math.min(DESKTOP_MAX_WIDTH, width - 96);
    const maxHeight = height - 160;
    const ratio = aspect ?? 1;
    const imageWidth = Math.min(maxWidth, maxHeight * ratio);
    const imageHeight = imageWidth / ratio;
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.desktopBackdrop} onPress={onClose}>
          <Pressable style={styles.desktopCard} onPress={(e) => e.stopPropagation()}>
            <Image
              source={{ uri }}
              style={{ width: imageWidth, height: imageHeight }}
              resizeMode="contain"
            />
            <Pressable style={[styles.close, styles.desktopClose]} onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <XMarkIcon size={22} color={INK} strokeWidth={2} />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

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
  desktopBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  desktopCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.25)',
  },
  desktopClose: {
    top: -16,
    right: -16,
    borderWidth: 1.5,
    borderColor: INK,
  },
});
