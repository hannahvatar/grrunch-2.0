import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { GrrunchMascot } from './GrrunchMascot';

// Onboarding slide 4 ("Let's bite back at grocery prices.") -- the mascot
// lunges and bites a price tag, which bursts into crumbs and disappears
// (Anabelle, 2026-10-09: "It should just bite a price tag that explode in
// crumbs and disappear"). A fresh tag pops back in and it loops while the
// slide is active. Same React Native Animated approach as the other
// onboarding illustrations; holds still with reduced motion.

const INK = '#111';
const ACCENT = '#FFA955';

// Crumb burst directions (dx, dy, size) from the tag's centre.
const CRUMBS: Array<[number, number, number]> = [
  [-46, -38, 12],
  [-10, -62, 9],
  [34, -50, 11],
  [58, -8, 10],
  [44, 40, 12],
  [6, 60, 9],
  [-36, 48, 10],
  [-60, 6, 8],
  [20, -24, 7],
  [-22, 22, 7],
];

export function BiteAnimation({ active }: { active: boolean }) {
  const lunge = useRef(new Animated.Value(0)).current; // 0 rest, 1 at the tag
  const chomp = useRef(new Animated.Value(0)).current; // squash on the bite
  const tag = useRef(new Animated.Value(1)).current; // 1 whole, 0 gone
  const burst = useRef(new Animated.Value(0)).current; // 0 none, 1 crumbs flown
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    lunge.setValue(0);
    chomp.setValue(0);
    tag.setValue(1);
    burst.setValue(0);
    if (!active || reduceMotion) return;
    const ease = Easing.bezier(0.3, 0.7, 0.3, 1);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(600),
        // Wind up, then lunge.
        Animated.timing(lunge, { toValue: -0.15, duration: 220, easing: ease, useNativeDriver: true }),
        Animated.timing(lunge, { toValue: 1, duration: 240, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        // Chomp: the tag vanishes in a burst of crumbs.
        Animated.parallel([
          Animated.sequence([
            Animated.timing(chomp, { toValue: 1, duration: 110, useNativeDriver: true }),
            Animated.timing(chomp, { toValue: 0, duration: 180, easing: ease, useNativeDriver: true }),
          ]),
          Animated.timing(tag, { toValue: 0, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.timing(burst, { toValue: 1, duration: 750, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        // Back off, satisfied.
        Animated.timing(lunge, { toValue: 0, duration: 420, easing: ease, useNativeDriver: true }),
        Animated.delay(700),
        // A new tag pops in for the next round.
        Animated.timing(burst, { toValue: 0, duration: 1, useNativeDriver: true }),
        Animated.spring(tag, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, reduceMotion, lunge, chomp, tag, burst]);

  const mascotStyle = {
    transform: [
      { translateX: lunge.interpolate({ inputRange: [-0.15, 0, 1], outputRange: [-8, 0, 50] }) },
      { rotate: lunge.interpolate({ inputRange: [-0.15, 0, 1], outputRange: ['-4deg', '0deg', '8deg'] }) },
      { scaleX: chomp.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) },
      { scaleY: chomp.interpolate({ inputRange: [0, 1], outputRange: [1, 0.88] }) },
    ],
  };
  const tagStyle = {
    opacity: tag,
    transform: [{ rotate: '8deg' }, { scale: tag.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
  };

  return (
    <View
      style={styles.stage}
      accessible
      accessibilityLabel="The Grrunch mascot bites a price tag, which bursts into crumbs"
    >
      <View style={styles.tagWrap}>
        <Animated.View style={[styles.tag, tagStyle]}>
          <View style={styles.tagHole} />
          <Text style={styles.price}>$12.99</Text>
        </Animated.View>
        {CRUMBS.map(([dx, dy, size], i) => (
          <Animated.View
            key={i}
            style={[
              styles.crumb,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: i % 3 === 0 ? '#fff' : ACCENT,
                opacity: burst.interpolate({ inputRange: [0, 0.05, 0.7, 1], outputRange: [0, 1, 1, 0] }),
                transform: [
                  { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
                  { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
                  { scale: burst.interpolate({ inputRange: [0, 1], outputRange: [1.2, 0.6] }) },
                ],
              },
            ]}
          />
        ))}
      </View>
      <Animated.View style={[styles.mascot, mascotStyle]}>
        <GrrunchMascot size={170} showCrumbs={false} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: 300, height: 220, justifyContent: 'center' },
  mascot: { position: 'absolute', left: 0, top: 25 },
  tagWrap: {
    position: 'absolute',
    right: 6,
    top: 52,
    width: 118,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: {
    width: 118,
    height: 100,
    backgroundColor: '#fff',
    borderWidth: 2.5,
    borderColor: INK,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagHole: {
    position: 'absolute',
    top: 10,
    right: 12,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2.5,
    borderColor: INK,
    backgroundColor: ACCENT,
  },
  price: { fontSize: 26, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
  crumb: { position: 'absolute', borderWidth: 1.5, borderColor: INK },
});
