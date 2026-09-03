import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

// Onboarding slide 1 ("Skip the deal hunting") illustration -- a folded
// grocery flyer that opens into a two-page spread, then circles 3 deals in
// red, on a continuous 9s loop. Ported from a design handoff prototype
// (design_handoff_onboarding_flyer/, 2026-09-03) that specified
// react-native-reanimated -- that package isn't actually installed in this
// project (the handoff doc was wrong about it being available), and this
// project has deliberately avoided adding it before for the same reason
// (see GroceryListView's swipe-to-remove: "much bigger blast radius" for a
// new native dependency). This is pure timing/looping, no gestures, so RN's
// own Animated API reproduces the exact same keyframes without it.
//
// All keyframe percentages/easings below are transcribed 1:1 from the
// prototype's CSS (see the handoff bundle's README.md for the full spec).

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

const INK = '#111';
const RED = '#E5232B';
const LOOP_MS = 9000;

const EASE_RISE = Easing.bezier(0.16, 0.84, 0.3, 1);
const EASE_FOLD = Easing.bezier(0.2, 0.8, 0.25, 1);
const EASE_CIRCLE = Easing.bezier(0.3, 0.7, 0.2, 1);

// -- 8 food icons, transcribed verbatim (viewBox/paths/colors) from the
// handoff prototype's inline SVGs -- same GRRUNCH illustration style as
// GrrunchMascot.tsx (heavy black outline, flat palette fills). --

function IconBase({ children }: { children: React.ReactNode }) {
  return (
    <Svg viewBox="0 0 48 48" width="100%" height="100%" fill="none" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round">
      {children}
    </Svg>
  );
}

function StrawberriesIcon() {
  return (
    <IconBase>
      <Path d="M24 9 L17.5 6 L24 3.5 L30.5 6 Z" fill="#96E696" />
      <Path
        d="M24 10.5 C33 10.5 38.5 17 38.5 24 C38.5 33 31 42.5 24 42.5 C17 42.5 9.5 33 9.5 24 C9.5 17 15 10.5 24 10.5 Z"
        fill="#FF7B2A"
      />
      <Circle cx={19} cy={21} r={1.7} fill="#FFE9D4" stroke="none" />
      <Circle cx={29} cy={24} r={1.7} fill="#FFE9D4" stroke="none" />
      <Circle cx={23} cy={32} r={1.7} fill="#FFE9D4" stroke="none" />
    </IconBase>
  );
}

function BeefIcon() {
  return (
    <IconBase>
      <Path
        d="M13 12 C22 8 34 9 39 15 C43.5 20.5 41 30.5 36 36 C31 41.5 20 43 14 39 C8 35 6.5 24 8.5 18.5 C9.5 15.5 11 13 13 12 Z"
        fill="#FFBF7F"
      />
      <Path
        d="M16.5 16.5 C23 13.5 31.5 14.5 35.5 19 C38.5 22.5 36.5 29.5 32.5 33.5 C28.5 37.5 21 38.5 16.5 35.5 C12 32.5 11.5 24 13 20 C13.7 18.2 15 17.1 16.5 16.5 Z"
        fill="#FF7B2A"
        strokeWidth={2}
      />
      <Path d="M20 27 C23 24 26 26 29 23" stroke="#FFD4AA" strokeWidth={2} />
    </IconBase>
  );
}

function SoySauceIcon() {
  return (
    <IconBase>
      <Rect x={19.5} y={4.5} width={9} height={5.5} rx={1.5} fill="#FFA955" />
      <Rect x={21} y={10} width={6} height={4} fill="#D5B5FF" />
      <Rect x={13.5} y={14} width={21} height={29} rx={4} fill="#D5B5FF" />
      <Rect x={17.5} y={22} width={13} height={10} rx={2} fill="#FFE9D4" />
    </IconBase>
  );
}

function YogurtIcon() {
  return (
    <IconBase>
      <Path d="M13 16 L35 16 L31 42.5 L17 42.5 Z" fill="#FFE9D4" />
      <Rect x={10.5} y={9.5} width={27} height={6.5} rx={2} fill="#C090FF" />
      <Path d="M15.6 26 L32.4 26 L31.5 33 L16.5 33 Z" fill="#C090FF" />
    </IconBase>
  );
}

function BroccoliIcon() {
  return (
    <IconBase>
      <Path d="M19.5 26 L19.5 42.5 L28.5 42.5 L28.5 26 Z" fill="#FFE9D4" />
      <Path
        d="M8.5 23.5 C6.5 20 9 16.5 12.5 17 C12 11.5 17 8 21 10 C22.5 4.5 30 5 31.5 10.5 C36 9.5 40 13.5 38.5 18 C42 19 42.5 24 39 26 C37 30 30 32 24 32 C16 32 10 29 8.5 23.5 Z"
        fill="#96E696"
      />
    </IconBase>
  );
}

function CheeseIcon() {
  return (
    <IconBase>
      <Path d="M8 35 L40 35 L40 14 Z" fill="#FFBF7F" />
      <Circle cx={30} cy={28} r={2.6} fill="#FFF6EC" stroke="none" />
      <Circle cx={35.5} cy={22} r={2.2} fill="#FFF6EC" stroke="none" />
    </IconBase>
  );
}

function PizzaIcon() {
  return (
    <IconBase>
      <Circle cx={24} cy={24} r={18} fill="#FFD4AA" />
      <Circle cx={24} cy={24} r={13} fill="#FFBF7F" strokeWidth={2} />
      <Circle cx={24} cy={18.5} r={2.8} fill="#FF7B2A" strokeWidth={1.8} />
      <Circle cx={19} cy={28} r={2.8} fill="#FF7B2A" strokeWidth={1.8} />
      <Circle cx={29} cy={28} r={2.8} fill="#FF7B2A" strokeWidth={1.8} />
    </IconBase>
  );
}

function ChipsIcon() {
  return (
    <IconBase>
      <Path d="M12.5 11 L35.5 11 L33.5 42.5 L14.5 42.5 Z" fill="#FFA955" />
      <Path d="M12.5 11 L16.5 6.5 L20.5 11 L24 6.5 L27.5 11 L31.5 6.5 L35.5 11" fill="#FFA955" />
      <Ellipse cx={24} cy={27} rx={8} ry={6} fill="#FFE9D4" strokeWidth={2} />
    </IconBase>
  );
}

function DealCell({ icon, name, price }: { icon: React.ReactNode; name: string; price: string }) {
  return (
    <View style={styles.cell}>
      <View style={styles.cellArt}>{icon}</View>
      <View style={styles.cellLabel}>
        <Text style={styles.cellName}>{name}</Text>
        <Text style={styles.cellPrice}>{price}</Text>
      </View>
    </View>
  );
}

export function FlyerAnimation({ active }: { active: boolean }) {
  const [reduceMotion, setReduceMotion] = useState(false);

  const rise = useRef(new Animated.Value(0)).current; // 0 -> 1, drives opacity/translateY/scale
  const leftRotate = useRef(new Animated.Value(-78)).current; // degrees
  const rightRotate = useRef(new Animated.Value(78)).current; // degrees
  const circle1 = useRef(new Animated.Value(0)).current; // 0 -> 1, drawn progress
  const circle2 = useRef(new Animated.Value(0)).current;
  const circle3 = useRef(new Animated.Value(0)).current;

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
      // Respect reduce-motion: render the end state, no animation at all.
      rise.setValue(1);
      leftRotate.setValue(0);
      rightRotate.setValue(0);
      circle1.setValue(1);
      circle2.setValue(1);
      circle3.setValue(1);
      return;
    }
    if (!active) return;

    // Reset to the start state every time this slide becomes active, so
    // revisiting it (via the dots or Back) always replays the fold-open
    // intro rather than resuming mid-loop.
    rise.setValue(0);
    leftRotate.setValue(-78);
    rightRotate.setValue(78);
    circle1.setValue(0);
    circle2.setValue(0);
    circle3.setValue(0);

    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(rise, { toValue: 1, duration: 1080, easing: EASE_RISE, useNativeDriver: true }),
          Animated.delay(LOOP_MS - 1080),
        ]),
        Animated.sequence([
          Animated.timing(leftRotate, { toValue: 4, duration: 990, easing: EASE_FOLD, useNativeDriver: true }),
          Animated.timing(leftRotate, { toValue: 0, duration: 360, easing: EASE_FOLD, useNativeDriver: true }),
          Animated.delay(LOOP_MS - 990 - 360),
        ]),
        Animated.sequence([
          Animated.timing(rightRotate, { toValue: -4, duration: 990, easing: EASE_FOLD, useNativeDriver: true }),
          Animated.timing(rightRotate, { toValue: 0, duration: 360, easing: EASE_FOLD, useNativeDriver: true }),
          Animated.delay(LOOP_MS - 990 - 360),
        ]),
        Animated.sequence([
          Animated.delay(1800),
          Animated.timing(circle1, { toValue: 1, duration: 900, easing: EASE_CIRCLE, useNativeDriver: false }),
          Animated.delay(LOOP_MS - 1800 - 900),
        ]),
        Animated.sequence([
          Animated.delay(3420),
          Animated.timing(circle2, { toValue: 1, duration: 900, easing: EASE_CIRCLE, useNativeDriver: false }),
          Animated.delay(LOOP_MS - 3420 - 900),
        ]),
        Animated.sequence([
          Animated.delay(5040),
          Animated.timing(circle3, { toValue: 1, duration: 900, easing: EASE_CIRCLE, useNativeDriver: false }),
          Animated.delay(LOOP_MS - 5040 - 900),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Animated.Value refs are stable, only active/reduceMotion should restart the loop
  }, [active, reduceMotion]);

  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  const scale = rise.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });
  // Numeric degree Animated.Values -> 'Ndeg' strings, linear passthrough.
  const leftRotateDeg = leftRotate.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] });
  const rightRotateDeg = rightRotate.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] });
  const dash1 = circle1.interpolate({ inputRange: [0, 1], outputRange: [300, 0] });
  const dash2 = circle2.interpolate({ inputRange: [0, 1], outputRange: [300, 0] });
  const dash3 = circle3.interpolate({ inputRange: [0, 1], outputRange: [300, 0] });

  return (
    <View style={styles.box}>
      <Animated.View style={[styles.spread, { opacity: rise, transform: [{ translateY }, { scale }] }]}>
        <View style={styles.spreadRow}>
          {/* transformOrigin has no RN equivalent -- pivot around the page's
              own edge (right edge for the left page, left edge for the
              right) via translate-rotate-translate, per the handoff's own
              note. Page width 150, half-width 75. */}
          <Animated.View
            style={[
              styles.leftPage,
              { transform: [{ perspective: 900 }, { translateX: -75 }, { rotateY: leftRotateDeg }, { translateX: 75 }] },
            ]}
          >
            <View style={styles.masthead}>
              <Text style={styles.mastheadText}>WEEKLY FLYER</Text>
            </View>
            <View style={styles.grid}>
              <View style={styles.gridRow}>
                <DealCell icon={<StrawberriesIcon />} name="Strawberries" price="$3.99" />
                <DealCell icon={<BeefIcon />} name="Beef" price="$7.99" />
              </View>
              <View style={styles.gridRow}>
                <DealCell icon={<SoySauceIcon />} name="Soy sauce" price="$2.88" />
                <DealCell icon={<YogurtIcon />} name="Yogurt" price="$3.49" />
              </View>
            </View>
          </Animated.View>

          <Animated.View
            style={[
              styles.rightPage,
              { transform: [{ perspective: 900 }, { translateX: 75 }, { rotateY: rightRotateDeg }, { translateX: -75 }] },
            ]}
          >
            <View style={styles.gridRow}>
              <DealCell icon={<BroccoliIcon />} name="Broccoli" price="$2.49" />
              <DealCell icon={<CheeseIcon />} name="Cheese" price="$4.99" />
            </View>
            <View style={styles.gridRow}>
              <DealCell icon={<PizzaIcon />} name="Pizza" price="$5.99" />
              <DealCell icon={<ChipsIcon />} name="Chips" price="$2.49" />
            </View>
          </Animated.View>
        </View>

        <Svg viewBox="0 0 300 230" width={300} height={230} style={styles.circleOverlay} pointerEvents="none">
          <AnimatedEllipse
            cx={110}
            cy={78}
            rx={35}
            ry={42}
            rotation={-7}
            originX={110}
            originY={78}
            stroke={RED}
            strokeWidth={3.5}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={300}
            strokeDashoffset={dash1}
          />
          <AnimatedEllipse
            cx={191}
            cy={61}
            rx={32}
            ry={46}
            rotation={6}
            originX={191}
            originY={61}
            stroke={RED}
            strokeWidth={3.5}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={300}
            strokeDashoffset={dash2}
          />
          <AnimatedEllipse
            cx={42}
            cy={173}
            rx={34}
            ry={45}
            rotation={4}
            originX={42}
            originY={173}
            stroke={RED}
            strokeWidth={3.5}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={300}
            strokeDashoffset={dash3}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: 300, height: 230, alignItems: 'center', justifyContent: 'center' },
  spread: {
    width: 300,
    height: 230,
    shadowColor: INK,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 6,
  },
  spreadRow: { flexDirection: 'row', width: 300, height: 230 },
  circleOverlay: { position: 'absolute', top: 0, left: 0 },
  leftPage: {
    width: 150,
    height: 230,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    borderRightWidth: 0,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    padding: 10,
    gap: 8,
  },
  rightPage: {
    width: 150,
    height: 230,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(17,17,17,0.35)',
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    padding: 10,
    gap: 8,
  },
  masthead: {
    height: 16,
    backgroundColor: '#FF942A',
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mastheadText: {
    fontSize: 7,
    fontWeight: '800',
    fontFamily: 'OpenSans_800ExtraBold',
    letterSpacing: 0.84,
    color: INK,
  },
  grid: { flex: 1, gap: 8 },
  gridRow: { flex: 1, flexDirection: 'row', gap: 8 },
  cell: { flex: 1, borderWidth: 1, borderColor: INK, borderRadius: 2, overflow: 'hidden' },
  cellArt: { flex: 1, backgroundColor: '#FFF6EC', alignItems: 'center', justifyContent: 'center', padding: 3 },
  cellLabel: { borderTopWidth: 1, borderTopColor: INK, paddingVertical: 3, paddingHorizontal: 4, gap: 1 },
  cellName: {
    fontSize: 6.5,
    fontWeight: '600',
    fontFamily: 'OpenSans_600SemiBold',
    color: '#343837',
    lineHeight: 7.5,
  },
  cellPrice: { fontSize: 9, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK },
});
