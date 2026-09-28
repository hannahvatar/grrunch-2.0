import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

// Empty-state illustration for Meals, Weekly Deals and My list between the
// Wednesday close and the Thursday noon drop (WeekGapState.tsx). Anabelle,
// 2026-09-28: "a big cauldron with a spoon stirring while something is
// simmering", the same on every empty-state screen.
//
// Same illustration style (heavy black outline, flat GRRUNCH palette) and
// the same RN Animated approach as the onboarding animations
// (FlyerAnimation.tsx, SauteAnimation.tsx) -- no reanimated in this project.
// Everything loops forever: the spoon stirs, bubbles rise and pop, steam
// drifts up, and the fire underneath flickers.

const INK = '#111';
// Black pot, purple stew (Anabelle, 2026-09-28). The pot is a soft black
// so its heavy black outline still reads.
const POT = '#343837';
const STEW = '#C090FF';
const STEW_LIGHT = '#E6D4FF';
const WOOD = '#FFBF7F';
const FLAME = '#FF7B2A';
const FLAME_CORE = '#FFD4AA';

const BOX_W = 300;
const BOX_H = 252;
// Centre of the stew's surface, in box coordinates.
const SURFACE_X = 150;
const SURFACE_Y = 116;

const STIR_MS = 2400;
const BUBBLE_MS = 1500;
const STEAM_MS = 2800;
const FLICKER_MS = 260;

const BUBBLES = [
  { x: -52, delay: 0, size: 12 },
  { x: -18, delay: 550, size: 9 },
  { x: 22, delay: 250, size: 14 },
  { x: 54, delay: 900, size: 10 },
];

const STEAM = [
  { x: -40, delay: 0, d: 'M10 44 C2 34 18 26 10 16 C4 8 12 2 10 0' },
  { x: 0, delay: 900, d: 'M10 44 C18 34 2 26 10 16 C16 8 8 2 10 0' },
  { x: 40, delay: 1800, d: 'M10 44 C2 34 18 26 10 16 C4 8 12 2 10 0' },
];

// Pot body, legs, rim and stew surface. Drawn under the spoon and bubbles.
function PotBack() {
  return (
    <Svg width={BOX_W} height={BOX_H} viewBox={`0 0 ${BOX_W} ${BOX_H}`} fill="none" stroke={INK} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round">
      <Rect x={92} y={196} width={16} height={24} rx={4} fill={POT} />
      <Rect x={192} y={196} width={16} height={24} rx={4} fill={POT} />
      <Path d="M64 116 C58 176 96 212 150 212 C204 212 242 176 236 116 Z" fill={POT} />
      {/* Shine on the pot's belly. */}
      <Path d="M84 142 C86 166 100 184 118 192" stroke="#6B6F6E" strokeWidth={5} />
      <Ellipse cx={150} cy={116} rx={90} ry={22} fill={POT} />
      <Ellipse cx={150} cy={118} rx={76} ry={15} fill={STEW} />
      <Path d="M104 118 C120 110 136 124 152 116 C168 108 184 122 198 116" stroke={STEW_LIGHT} strokeWidth={3} />
    </Svg>
  );
}

// The front lip of the rim, drawn over the spoon's foot so the spoon reads
// as sitting inside the pot.
function PotLip() {
  return (
    <Svg width={BOX_W} height={BOX_H} viewBox={`0 0 ${BOX_W} ${BOX_H}`} fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round">
      <Path d="M60 116 C62 132 100 140 150 140 C200 140 238 132 240 116" fill="none" strokeWidth={3} />
    </Svg>
  );
}

function Spoon() {
  return (
    <Svg width={36} height={132} viewBox="0 0 36 132" fill="none" stroke={INK} strokeWidth={3} strokeLinejoin="round">
      <Rect x={13} y={2} width={10} height={112} rx={5} fill={WOOD} />
      <Ellipse cx={18} cy={116} rx={14} ry={12} fill={WOOD} />
    </Svg>
  );
}

function Flame() {
  return (
    <Svg width={34} height={40} viewBox="0 0 34 40" fill="none" stroke={INK} strokeWidth={2.6} strokeLinejoin="round">
      <Path d="M17 2 C22 12 32 18 30 28 C28 36 22 38 17 38 C12 38 6 36 4 28 C2 18 12 12 17 2 Z" fill={FLAME} />
      <Path d="M17 16 C20 22 24 25 23 30 C22 34 19 35 17 35 C15 35 12 34 11 30 C10 25 14 22 17 16 Z" fill={FLAME_CORE} strokeWidth={2} />
    </Svg>
  );
}

function Steam({ d }: { d: string }) {
  return (
    <Svg width={20} height={46} viewBox="0 0 20 46" fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round">
      <Path d={d} />
    </Svg>
  );
}

function Bubble({ size }: { size: number }) {
  return (
    <Svg width={size + 4} height={size + 4} viewBox={`0 0 ${size + 4} ${size + 4}`}>
      <Circle cx={(size + 4) / 2} cy={(size + 4) / 2} r={size / 2} fill={STEW_LIGHT} stroke={INK} strokeWidth={2.2} />
    </Svg>
  );
}

export function CauldronAnimation({ active }: { active: boolean }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const stir = useRef(new Animated.Value(0)).current; // 0 -> 1, one full circle
  const bubbles = useRef(BUBBLES.map(() => new Animated.Value(0))).current;
  const steam = useRef(STEAM.map(() => new Animated.Value(0))).current;
  const flicker = useRef(new Animated.Value(0)).current;

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
    if (reduceMotion || !active) {
      // Reduce motion: a still cauldron, spoon upright, no bubbles/steam.
      stir.setValue(0);
      bubbles.forEach((b) => b.setValue(0));
      steam.forEach((s) => s.setValue(0));
      flicker.setValue(0);
      return;
    }

    const loops = [
      Animated.loop(Animated.timing(stir, { toValue: 1, duration: STIR_MS, easing: Easing.linear, useNativeDriver: true })),
      ...BUBBLES.map((bubble, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(bubble.delay),
            Animated.timing(bubbles[i], { toValue: 1, duration: BUBBLE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(bubbles[i], { toValue: 0, duration: 0, useNativeDriver: true }),
          ])
        )
      ),
      ...STEAM.map((wisp, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(wisp.delay),
            Animated.timing(steam[i], { toValue: 1, duration: STEAM_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(steam[i], { toValue: 0, duration: 0, useNativeDriver: true }),
          ])
        )
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(flicker, { toValue: 1, duration: FLICKER_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(flicker, { toValue: 0, duration: FLICKER_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      ),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Animated.Value refs are stable
  }, [active, reduceMotion]);

  // The spoon's foot travels round a circle in the pot (seen from the
  // side, so an ellipse the shape of the stew's surface), and the handle
  // leans the way it's moving. Sampled at 24 points so the path is a
  // smooth circle, not a diamond.
  const STEPS = 24;
  const circle = Array.from({ length: STEPS + 1 }, (_, i) => i / STEPS);
  const spoonX = stir.interpolate({ inputRange: circle, outputRange: circle.map((t) => 48 * Math.sin(t * 2 * Math.PI)) });
  const spoonY = stir.interpolate({ inputRange: circle, outputRange: circle.map((t) => 8 * Math.cos(t * 2 * Math.PI)) });
  const spoonTilt = stir.interpolate({
    inputRange: circle,
    outputRange: circle.map((t) => `${12 * Math.sin(t * 2 * Math.PI)}deg`),
  });
  const flameScale = flicker.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const flameScaleAlt = flicker.interpolate({ inputRange: [0, 1], outputRange: [1.15, 0.95] });

  return (
    <View style={styles.box}>
      {/* Fire, behind the pot. */}
      {[-28, 0, 28].map((x, i) => (
        <Animated.View
          key={x}
          style={[
            styles.flame,
            { left: SURFACE_X - 17 + x, transform: [{ scaleY: i % 2 ? flameScaleAlt : flameScale }] },
          ]}
        >
          <Flame />
        </Animated.View>
      ))}

      <View style={StyleSheet.absoluteFill}>
        <PotBack />
      </View>

      {BUBBLES.map((bubble, i) => {
        const translateY = bubbles[i].interpolate({ inputRange: [0, 1], outputRange: [4, -20] });
        const scale = bubbles[i].interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.3, 1, 1.25] });
        const opacity = bubbles[i].interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] });
        return (
          <Animated.View
            key={i}
            style={[
              styles.abs,
              {
                left: SURFACE_X + bubble.x - (bubble.size + 4) / 2,
                top: SURFACE_Y - (bubble.size + 4) / 2,
                opacity,
                transform: [{ translateY }, { scale }],
              },
            ]}
          >
            <Bubble size={bubble.size} />
          </Animated.View>
        );
      })}

      {STEAM.map((wisp, i) => {
        const translateY = steam[i].interpolate({ inputRange: [0, 1], outputRange: [10, -26] });
        const opacity = steam[i].interpolate({ inputRange: [0, 0.3, 0.7, 1], outputRange: [0, 0.8, 0.6, 0] });
        return (
          <Animated.View
            key={i}
            style={[styles.abs, { left: SURFACE_X + wisp.x - 10, top: 38, opacity, transform: [{ translateY }] }]}
          >
            <Steam d={wisp.d} />
          </Animated.View>
        );
      })}

      {/* Spoon: its foot sits in the stew at the surface centre, pivoting
          from there. */}
      <Animated.View
        style={[
          styles.spoon,
          { transform: [{ translateX: spoonX }, { translateY: spoonY }, { rotate: spoonTilt }] },
        ]}
      >
        <Spoon />
      </Animated.View>
      {/* A little stew ripple that follows the spoon and hides its foot. */}
      <Animated.View style={[styles.ripple, { transform: [{ translateX: spoonX }, { translateY: spoonY }] }]}>
        <Svg width={56} height={20} viewBox="0 0 56 20">
          <Ellipse cx={28} cy={10} rx={26} ry={8.5} fill={STEW} stroke={INK} strokeWidth={2.4} />
        </Svg>
      </Animated.View>

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <PotLip />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: BOX_W, height: BOX_H },
  abs: { position: 'absolute' },
  flame: { position: 'absolute', top: 206, transformOrigin: 'bottom' },
  // Spoon is 36x132; its bowl's centre (18, 116) sits on the surface.
  spoon: { position: 'absolute', left: SURFACE_X - 18, top: SURFACE_Y - 116, transformOrigin: '50% 88%' },
  ripple: { position: 'absolute', left: SURFACE_X - 28, top: SURFACE_Y + 6 - 9 },
});
