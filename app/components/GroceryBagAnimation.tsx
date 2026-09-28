import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { BroccoliIcon, CheeseIcon, StrawberriesIcon } from './FlyerAnimation';

// Grocery list empty-state illustration (Wednesday close to Thursday noon,
// see WeekGapState.tsx): three foods drop one by one into a paper bag,
// the bag squishes as each lands, then they fade out and the loop starts
// again. Same illustration style and RN Animated approach as the
// onboarding animations (FlyerAnimation.tsx, SauteAnimation.tsx), and it
// reuses FlyerAnimation's food icons.

const INK = '#111';
const LOOP_MS = 6000;
const DROP_MS = 650;
const EASE_DROP = Easing.bezier(0.5, 0, 0.75, 0);
const EASE_SQUISH = Easing.bezier(0.3, 0.7, 0.2, 1);

const DROPS = [
  { at: 400, x: -34, icon: <BroccoliIcon /> },
  { at: 1300, x: 30, icon: <StrawberriesIcon /> },
  { at: 2200, x: -2, icon: <CheeseIcon /> },
];

function Bag() {
  return (
    <Svg viewBox="0 0 160 150" width={160} height={150} fill="none" stroke={INK} strokeWidth={3} strokeLinejoin="round">
      <Path d="M18 30 L142 30 L132 146 L28 146 Z" fill="#FFBF7F" />
      <Path d="M18 30 L28 18 L132 18 L142 30" fill="#FFA955" />
      <Rect x={52} y={66} width={56} height={36} rx={8} fill="#FFE9D4" strokeWidth={2.4} />
      <Path d="M62 80 L98 80 M62 90 L88 90" strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

export function GroceryBagAnimation({ active }: { active: boolean }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const drops = useRef(DROPS.map(() => new Animated.Value(0))).current; // 0 above, 1 in the bag
  const squish = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduceMotion(v);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      drops.forEach((d) => d.setValue(1));
      squish.setValue(0);
      return;
    }
    if (!active) return;
    drops.forEach((d) => d.setValue(0));
    squish.setValue(0);

    const squishAt = (at: number) =>
      Animated.sequence([
        Animated.delay(at + DROP_MS),
        Animated.timing(squish, { toValue: 1, duration: 120, easing: EASE_SQUISH, useNativeDriver: true }),
        Animated.timing(squish, { toValue: 0, duration: 260, easing: EASE_SQUISH, useNativeDriver: true }),
      ]);

    const loop = Animated.loop(
      Animated.parallel([
        ...DROPS.map((drop, i) =>
          Animated.sequence([
            Animated.delay(drop.at),
            Animated.timing(drops[i], { toValue: 1, duration: DROP_MS, easing: EASE_DROP, useNativeDriver: true }),
            Animated.delay(LOOP_MS - drop.at - DROP_MS - 500),
            Animated.timing(drops[i], { toValue: 1.4, duration: 500, useNativeDriver: true }),
          ])
        ),
        Animated.parallel(DROPS.map((drop) => squishAt(drop.at))),
        Animated.delay(LOOP_MS),
      ])
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Animated.Value refs are stable
  }, [active, reduceMotion]);

  const bagScaleY = squish.interpolate({ inputRange: [0, 1], outputRange: [1, 0.93] });
  const bagScaleX = squish.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });

  return (
    <View style={styles.box}>
      {DROPS.map((drop, i) => {
        // 0 -> 1: falls from above into the bag's mouth. 1 -> 1.4: sinks
        // a little further and fades, clearing the bag for the next loop.
        const translateY = drops[i].interpolate({ inputRange: [0, 1, 1.4], outputRange: [-150, 0, 20] });
        const opacity = drops[i].interpolate({ inputRange: [0, 0.05, 1, 1.4], outputRange: [0, 1, 1, 0] });
        return (
          <Animated.View
            key={i}
            style={[styles.food, { opacity, transform: [{ translateX: drop.x }, { translateY }] }]}
          >
            {drop.icon}
          </Animated.View>
        );
      })}
      <Animated.View style={[styles.bag, { transform: [{ scaleX: bagScaleX }, { scaleY: bagScaleY }] }]}>
        <Bag />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: 300, height: 230, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  // Foods sit just inside the bag's mouth, drawn behind the bag.
  food: { position: 'absolute', bottom: 108, width: 52, height: 52 },
  bag: { transformOrigin: 'bottom' },
});
