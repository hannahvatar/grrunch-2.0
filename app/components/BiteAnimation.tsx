import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { GrrunchMascot } from './GrrunchMascot';

// Onboarding slide 4 ("Let's bite back at grocery prices.") -- a pile of
// price tags; the mascot drops from the top, slams down on it, and the
// whole pile bursts into crumbs and disappears (Anabelle, 2026-10-09:
// "There should be a pile of price tags. The mascot comes from the top and
// lands with force on it and the pile disappears in crumbs"). It plays
// once each time the slide
// is active. Same React Native Animated approach as the other onboarding
// illustrations; with reduced motion it just shows the mascot, no pile.

const INK = '#111';
const ACCENT = '#FFA955';

const STAGE_W = 300;
const STAGE_H = 230;
// A little under the other slides' visuals (FlyerAnimation is 300 x 230).
const MASCOT = 190;
const GROUND = STAGE_H; // y of the floor line

type TagSpec = { price: string; x: number; y: number; rotate: string };
// The pile, bottom tags first, centred under the mascot.
const PILE: TagSpec[] = [
  { price: '$12.99', x: STAGE_W / 2 - 46, y: GROUND - 58, rotate: '-8deg' },
  { price: '$15.99', x: STAGE_W / 2 + 46, y: GROUND - 56, rotate: '7deg' },
  { price: '$8.49', x: STAGE_W / 2, y: GROUND - 64, rotate: '2deg' },
  { price: '$9.99', x: STAGE_W / 2 - 26, y: GROUND - 104, rotate: '10deg' },
  { price: '$11.49', x: STAGE_W / 2 + 26, y: GROUND - 102, rotate: '-9deg' },
];
const PILE_TOP = GROUND - 104;
const PILE_CENTRE = { x: STAGE_W / 2, y: GROUND - 60 };

// Crumb burst (dx, dy, size) from the pile's centre.
const CRUMBS: Array<[number, number, number]> = [
  [-120, -40, 12], [-90, -90, 10], [-50, -120, 11], [0, -130, 9], [52, -118, 12],
  [96, -86, 10], [126, -36, 11], [118, 20, 9], [84, 40, 12], [-80, 40, 10],
  [-124, 16, 9], [-30, -70, 8], [36, -64, 8], [-140, -70, 7], [146, -80, 7],
];

export function BiteAnimation({ active }: { active: boolean }) {
  const drop = useRef(new Animated.Value(0)).current; // 0 above frame, 1 on pile, 2 on floor
  const squash = useRef(new Animated.Value(0)).current; // impact squash
  const pile = useRef(new Animated.Value(1)).current; // 1 whole, 0 gone
  const burst = useRef(new Animated.Value(0)).current; // crumbs
  const shake = useRef(new Animated.Value(0)).current; // stage jolt
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    squash.setValue(0);
    burst.setValue(0);
    shake.setValue(0);
    if (!active || reduceMotion) {
      drop.setValue(reduceMotion ? 2 : 0);
      pile.setValue(reduceMotion ? 0 : 1);
      return;
    }
    drop.setValue(0);
    pile.setValue(1);
    // Plays once: after the smash the mascot stays put (Anabelle,
    // 2026-10-09: "Dont make it loop ... let it sit there").
    const run = Animated.sequence([
        // Let the pile sit on screen a moment before the smash.
        Animated.delay(1400),
        // Fall from the top and slam onto the pile.
        Animated.timing(drop, { toValue: 1, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        // Impact: squash, jolt, the pile bursts into crumbs and vanishes,
        // and the mascot keeps going down to the floor.
        Animated.parallel([
          Animated.sequence([
            Animated.timing(squash, { toValue: 1, duration: 90, useNativeDriver: true }),
            Animated.spring(squash, { toValue: 0, friction: 4, tension: 160, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(shake, { toValue: 1, duration: 50, useNativeDriver: true }),
            Animated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: true }),
            Animated.timing(shake, { toValue: 0.5, duration: 60, useNativeDriver: true }),
            Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
          ]),
          Animated.timing(pile, { toValue: 0, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.timing(burst, { toValue: 1, duration: 850, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.sequence([
            Animated.delay(60),
            Animated.spring(drop, { toValue: 2, friction: 5, tension: 140, useNativeDriver: true }),
          ]),
        ]),
      ]);
    run.start();
    return () => run.stop();
  }, [active, reduceMotion, drop, squash, pile, burst, shake]);

  // Mascot's bottom edge: off the top (0), on the pile (1), on the floor (2).
  const restTop = GROUND - MASCOT; // standing on the floor
  const mascotStyle = {
    transform: [
      {
        translateY: drop.interpolate({
          inputRange: [0, 1, 2],
          outputRange: [-STAGE_H - MASCOT, PILE_TOP - MASCOT + 18, restTop],
        }),
      },
      { scaleX: squash.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) },
      { scaleY: squash.interpolate({ inputRange: [0, 1], outputRange: [1, 0.78] }) },
    ],
  };
  const stageStyle = {
    transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-6, 6] }) }],
  };

  return (
    <Animated.View
      style={[styles.stage, stageStyle]}
      accessible
      accessibilityLabel="The Grrunch mascot lands on a pile of price tags, which bursts into crumbs"
    >
      {PILE.map((tag) => (
        <Animated.View
          key={tag.price}
          style={[
            styles.tag,
            {
              left: tag.x - 42,
              top: tag.y,
              opacity: pile,
              transform: [
                { rotate: tag.rotate },
                { scale: pile.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
              ],
            },
          ]}
        >
          <View style={styles.tagHole} />
          <Text style={styles.price}>{tag.price}</Text>
        </Animated.View>
      ))}
      {CRUMBS.map(([dx, dy, size], c) => (
        <Animated.View
          key={c}
          style={[
            styles.crumb,
            {
              left: PILE_CENTRE.x - size / 2,
              top: PILE_CENTRE.y - size / 2,
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: c % 3 === 0 ? '#fff' : ACCENT,
              opacity: burst.interpolate({ inputRange: [0, 0.04, 0.7, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
                // A little arc: up and out, then falling back.
                { translateY: burst.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, dy, dy + 40] }) },
                { scale: burst.interpolate({ inputRange: [0, 1], outputRange: [1.2, 0.7] }) },
              ],
            },
          ]}
        />
      ))}
      <Animated.View style={[styles.mascot, mascotStyle]}>
        <GrrunchMascot size={MASCOT} showCrumbs={false} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stage: { width: STAGE_W, height: STAGE_H, overflow: 'hidden' },
  mascot: { position: 'absolute', left: (STAGE_W - MASCOT) / 2, top: 0 },
  tag: {
    position: 'absolute',
    width: 84,
    height: 54,
    backgroundColor: '#fff',
    borderWidth: 2.5,
    borderColor: INK,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagHole: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: ACCENT,
  },
  price: { fontSize: 17, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  crumb: { position: 'absolute', borderWidth: 1.5, borderColor: INK },
});
