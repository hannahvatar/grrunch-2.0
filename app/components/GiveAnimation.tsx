import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

// Onboarding slide 5 ("Let's Bite Back at Hunger, Together", the 1% to
// food banks): a grocery bag with a heart popping out of it (Anabelle,
// 2026-10-30, "grocery bag + heart"). The heart rises out of the bag,
// lands with a bounce, then pulses gently; three small hearts float up.
// Plays each time the slide is active. Same React Native Animated approach
// as the other onboarding illustrations; with reduced motion it shows the
// heart already sitting above the bag.

const STAGE_W = 300;
const STAGE_H = 230;
const BAG_W = 150;
const BAG_H = 150;
const HEART = 76;
const SMALL = 26;

const BAG_XML = `<svg viewBox="0 0 150 150" xmlns="http://www.w3.org/2000/svg">
  <g transform="rotate(-38 58 22)">
    <rect x="28" y="13" width="62" height="18" rx="9" fill="#E9B35F" stroke="#111" stroke-width="3"/>
    <path d="M44 17 l5 10 M57 17 l5 10 M70 17 l5 10" stroke="#B5832F" stroke-width="3" stroke-linecap="round"/>
  </g>
  <path d="M60 40 C52 22 58 10 66 6 C70 16 72 28 68 40 Z" fill="#5BAE4A" stroke="#111" stroke-width="3" stroke-linejoin="round"/>
  <path d="M74 40 C76 24 88 14 98 14 C96 26 88 36 80 40 Z" fill="#7CC35F" stroke="#111" stroke-width="3" stroke-linejoin="round"/>
  <path d="M96 40 C100 26 110 20 118 22 C114 32 106 38 102 40 Z" fill="#5BAE4A" stroke="#111" stroke-width="3" stroke-linejoin="round"/>
  <path d="M18 40 H132 L124 144 H26 Z" fill="#E9C99A" stroke="#111" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M18 40 L28 54 H122 L132 40" fill="#D9B27C" stroke="#111" stroke-width="3" stroke-linejoin="round"/>
  <path d="M75 78 C66 66 50 70 50 84 C50 98 75 112 75 112 C75 112 100 98 100 84 C100 70 84 66 75 78 Z" fill="#FF942A" stroke="#111" stroke-width="3" stroke-linejoin="round"/>
</svg>`;

const HEART_XML = `<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg">
  <path d="M50 22 C38 2 6 6 6 32 C6 58 50 84 50 84 C50 84 94 58 94 32 C94 6 62 2 50 22 Z" fill="#FF942A" stroke="#111" stroke-width="5" stroke-linejoin="round"/>
  <path d="M24 26 C26 18 34 14 40 16" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
</svg>`;

// Small hearts: start x offset from centre, rise distance, delay (ms).
const FLOATERS: Array<[number, number, number]> = [
  [-70, 120, 0],
  [72, 110, 260],
  [-10, 140, 520],
];

export function GiveAnimation({ active }: { active: boolean }) {
  const rise = useRef(new Animated.Value(0)).current; // 0 in the bag, 1 above it
  const pulse = useRef(new Animated.Value(0)).current;
  const floats = useRef(FLOATERS.map(() => new Animated.Value(0))).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    pulse.setValue(0);
    floats.forEach((f) => f.setValue(0));
    if (!active || reduceMotion) {
      rise.setValue(reduceMotion ? 1 : 0);
      return;
    }
    rise.setValue(0);
    const run = Animated.sequence([
      Animated.delay(400),
      Animated.spring(rise, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
      Animated.parallel([
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulse, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          ]),
          { iterations: 3 }
        ),
        Animated.stagger(
          260,
          floats.map((f) => Animated.timing(f, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }))
        ),
      ]),
    ]);
    run.start();
    return () => run.stop();
  }, [active, reduceMotion, rise, pulse, floats]);

  const heartTranslate = rise.interpolate({ inputRange: [0, 1], outputRange: [70, 0] });
  const heartScale = Animated.multiply(
    rise.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] })
  );

  return (
    <View style={styles.stage} accessibilityRole="image" accessibilityLabel="A grocery bag with a heart rising out of it">
      {FLOATERS.map(([dx, distance], i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={[
            styles.small,
            {
              left: STAGE_W / 2 + dx - SMALL / 2,
              opacity: floats[i].interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] }),
              transform: [{ translateY: floats[i].interpolate({ inputRange: [0, 1], outputRange: [0, -distance] }) }],
            },
          ]}
        >
          <SvgXml xml={HEART_XML} width={SMALL} height={SMALL * 0.9} />
        </Animated.View>
      ))}
      <Animated.View
        pointerEvents="none"
        style={[styles.heart, { transform: [{ translateY: heartTranslate }, { scale: heartScale }] }]}
      >
        <SvgXml xml={HEART_XML} width={HEART} height={HEART * 0.9} />
      </Animated.View>
      <View style={styles.bag}>
        <SvgXml xml={BAG_XML} width={BAG_W} height={BAG_H} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: STAGE_W, height: STAGE_H, alignSelf: 'center' },
  bag: { position: 'absolute', left: (STAGE_W - BAG_W) / 2, bottom: 0 },
  heart: { position: 'absolute', left: (STAGE_W - HEART) / 2, top: 0 },
  small: { position: 'absolute', bottom: 70 },
});
