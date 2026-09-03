import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

// Onboarding slide 2 ("Let the deals decide dinner") illustration -- a pan
// rises in, a noodle bed lands, three beef strips and two broccoli florets
// drop in one at a time, a soy-sauce bottle tips over the pan, the pan
// tosses, steam rises, on a continuous 9s loop. Same build as
// FlyerAnimation.tsx (design_handoff_onboarding_flyer/, 2026-09-03 zip,
// slide 2 addition) -- React Native's own Animated API, no Reanimated (see
// that file's header comment for why), all keyframe timings/easings
// transcribed from the handoff's CSS.
//
// One deliberate simplification, flagged here rather than silently done:
// the 3 steam wisps have a slight staggered start in the source (0/350/700ms
// CSS animation-delay) -- reproduced faithfully via 2 independently-delayed
// loops for wisps 2 and 3, rather than dropping the stagger.

const AnimatedG = Animated.createAnimatedComponent(G);

const LOOP_MS = 9000;

const EASE_RISE = Easing.bezier(0.16, 0.84, 0.3, 1);
const EASE_DROP = Easing.bezier(0.3, 0.9, 0.4, 1);
const EASE_TOSS = Easing.bezier(0.4, 0.8, 0.3, 1);
const EASE_BOTTLE = Easing.bezier(0.3, 0.8, 0.3, 1);
const EASE_STEAM = Easing.out(Easing.quad); // CSS "ease-out" approximation

// One keyframe track: hold at the value's initial state for `holdMs`, then
// run through `segs` (each {to, ms}) in order, then hold at the final value
// for whatever's left of the 9s loop. A "no-op" seg (to === current value)
// is a valid way to represent a CSS keyframe range where a property isn't
// re-declared -- used throughout below wherever the source CSS holds a
// value flat across an unlabeled span.
function track(value: Animated.Value, holdMs: number, segs: { to: number; ms: number }[], easing: (t: number) => number) {
  const used = holdMs + segs.reduce((sum, s) => sum + s.ms, 0);
  return Animated.sequence([
    Animated.delay(holdMs),
    ...segs.map((s) => Animated.timing(value, { toValue: s.to, duration: s.ms, easing, useNativeDriver: true })),
    Animated.delay(Math.max(0, LOOP_MS - used)),
  ]);
}

function NoodleBed() {
  const paths = [
    'M98 150 C114 140 126 160 142 150 C156 141 170 158 188 148 C198 142 206 150 212 146',
    'M94 161 C110 151 122 171 138 161 C152 153 168 169 184 159 C194 153 204 161 210 157',
    'M100 171 C116 161 128 179 144 169 C158 161 174 177 192 167',
    'M110 179 C126 171 138 185 154 177 C166 171 180 183 194 176',
  ];
  return (
    <G>
      <G stroke="#111" strokeWidth={9} fill="none">
        {paths.map((d) => (
          <Path key={d} d={d} />
        ))}
      </G>
      <G stroke="#FFD4AA" strokeWidth={4.5} fill="none">
        {paths.map((d) => (
          <Path key={d} d={d} />
        ))}
      </G>
    </G>
  );
}

function BeefStrip({ x, y, w, h, rx, rotate, origin, mx, my, mw, mh }: {
  x: number; y: number; w: number; h: number; rx: number; rotate: number; origin: [number, number];
  mx: number; my: number; mw: number; mh: number;
}) {
  return (
    <G rotation={rotate} originX={origin[0]} originY={origin[1]}>
      <Rect x={x} y={y} width={w} height={h} rx={rx} fill="#FF7B2A" />
      <Rect x={mx} y={my} width={mw} height={mh} rx={3.5} fill="#FFD4AA" strokeWidth={2.2} />
    </G>
  );
}

function BroccoliFloret({ stalk, cloud }: { stalk: string; cloud: string }) {
  return (
    <G translateY={10}>
      <Path d={stalk} fill="#FFE9D4" />
      <Path d={cloud} fill="#96E696" />
    </G>
  );
}

function SoySauceBottle() {
  return (
    <G>
      <Rect x={212} y={50} width={16} height={9} rx={2} fill="#FFA955" strokeWidth={3} />
      <Rect x={214} y={59} width={12} height={11} fill="#D5B5FF" strokeWidth={3} />
      <Rect x={206} y={70} width={28} height={42} rx={4} fill="#D5B5FF" strokeWidth={3} />
      <Rect x={211} y={82} width={18} height={15} rx={2} fill="#FFE9D4" strokeWidth={2.4} />
    </G>
  );
}

function Steam({ opacity, translateY, d }: { opacity: Animated.Value; translateY: Animated.Value; d: string }) {
  return (
    <AnimatedG opacity={opacity} translateY={translateY}>
      <Path d={d} strokeWidth={3} />
    </AnimatedG>
  );
}

export function SauteAnimation({ active }: { active: boolean }) {
  const [reduceMotion, setReduceMotion] = useState(false);

  // -- rise (pan group) --
  const riseOpacity = useRef(new Animated.Value(0)).current;
  const riseY = useRef(new Animated.Value(18)).current;
  const riseScale = useRef(new Animated.Value(0.95)).current;

  // -- panToss (rotate + Y on the whole pan+bed+food group) --
  const tossRotate = useRef(new Animated.Value(0)).current;
  const tossY = useRef(new Animated.Value(0)).current;

  // -- foodToss (rotate + Y on just the food items) --
  const foodRotate = useRef(new Animated.Value(0)).current;
  const foodY = useRef(new Animated.Value(0)).current;

  // -- bedIn (noodle bed) --
  const bedOpacity = useRef(new Animated.Value(0)).current;
  const bedY = useRef(new Animated.Value(-70)).current;

  // -- beef strips (3) --
  const beefAOpacity = useRef(new Animated.Value(0)).current;
  const beefAY = useRef(new Animated.Value(-90)).current;
  const beefBOpacity = useRef(new Animated.Value(0)).current;
  const beefBY = useRef(new Animated.Value(-90)).current;
  const beefCOpacity = useRef(new Animated.Value(0)).current;
  const beefCY = useRef(new Animated.Value(-90)).current;

  // -- broccoli florets (2) --
  const brocAOpacity = useRef(new Animated.Value(0)).current;
  const brocAY = useRef(new Animated.Value(-95)).current;
  const brocARotate = useRef(new Animated.Value(-20)).current;
  const brocBOpacity = useRef(new Animated.Value(0)).current;
  const brocBY = useRef(new Animated.Value(-95)).current;
  const brocBRotate = useRef(new Animated.Value(18)).current;

  // -- garnish dots --
  const garnishOpacity = useRef(new Animated.Value(0)).current;
  const garnishY = useRef(new Animated.Value(-40)).current;

  // -- soy sauce bottle --
  const bottleOpacity = useRef(new Animated.Value(0)).current;
  const bottleX = useRef(new Animated.Value(26)).current;
  const bottleY = useRef(new Animated.Value(-34)).current;
  const bottleRotate = useRef(new Animated.Value(0)).current;

  // -- steam (3 wisps, 2 with an independent leading delay) --
  const steam1Opacity = useRef(new Animated.Value(0)).current;
  const steam1Y = useRef(new Animated.Value(6)).current;
  const steam2Opacity = useRef(new Animated.Value(0)).current;
  const steam2Y = useRef(new Animated.Value(6)).current;
  const steam3Opacity = useRef(new Animated.Value(0)).current;
  const steam3Y = useRef(new Animated.Value(6)).current;

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
      // Static end state: a finished-looking dish sitting settled in the
      // pan. The bottle and steam are momentary visitors, not part of the
      // "at rest" picture, so they stay hidden rather than frozen mid-air.
      riseOpacity.setValue(1);
      riseY.setValue(0);
      riseScale.setValue(1);
      tossRotate.setValue(0);
      tossY.setValue(0);
      foodRotate.setValue(0);
      foodY.setValue(0);
      bedOpacity.setValue(1);
      bedY.setValue(0);
      beefAOpacity.setValue(1);
      beefAY.setValue(0);
      beefBOpacity.setValue(1);
      beefBY.setValue(0);
      beefCOpacity.setValue(1);
      beefCY.setValue(0);
      brocAOpacity.setValue(1);
      brocAY.setValue(0);
      brocARotate.setValue(0);
      brocBOpacity.setValue(1);
      brocBY.setValue(0);
      brocBRotate.setValue(0);
      garnishOpacity.setValue(1);
      garnishY.setValue(0);
      bottleOpacity.setValue(0);
      bottleX.setValue(26);
      bottleY.setValue(-34);
      bottleRotate.setValue(0);
      steam1Opacity.setValue(0);
      steam1Y.setValue(6);
      steam2Opacity.setValue(0);
      steam2Y.setValue(6);
      steam3Opacity.setValue(0);
      steam3Y.setValue(6);
      return;
    }
    if (!active) return;

    // Reset every value to its initial state before (re)starting, so
    // revisiting this slide always replays the full sequence from "empty
    // pan" rather than resuming mid-loop.
    riseOpacity.setValue(0);
    riseY.setValue(18);
    riseScale.setValue(0.95);
    tossRotate.setValue(0);
    tossY.setValue(0);
    foodRotate.setValue(0);
    foodY.setValue(0);
    bedOpacity.setValue(0);
    bedY.setValue(-70);
    beefAOpacity.setValue(0);
    beefAY.setValue(-90);
    beefBOpacity.setValue(0);
    beefBY.setValue(-90);
    beefCOpacity.setValue(0);
    beefCY.setValue(-90);
    brocAOpacity.setValue(0);
    brocAY.setValue(-95);
    brocARotate.setValue(-20);
    brocBOpacity.setValue(0);
    brocBY.setValue(-95);
    brocBRotate.setValue(18);
    garnishOpacity.setValue(0);
    garnishY.setValue(-40);
    bottleOpacity.setValue(0);
    bottleX.setValue(26);
    bottleY.setValue(-34);
    bottleRotate.setValue(0);
    steam1Opacity.setValue(0);
    steam1Y.setValue(6);
    steam2Opacity.setValue(0);
    steam2Y.setValue(6);
    steam3Opacity.setValue(0);
    steam3Y.setValue(6);

    const mainLoop = Animated.loop(
      Animated.parallel([
        track(riseOpacity, 0, [{ to: 1, ms: 720 }], EASE_RISE),
        track(riseY, 0, [{ to: 0, ms: 720 }], EASE_RISE),
        track(riseScale, 0, [{ to: 1, ms: 720 }], EASE_RISE),

        track(tossRotate, 5400, [{ to: -3.5, ms: 360 }, { to: 2.5, ms: 360 }, { to: -1.5, ms: 360 }, { to: 0, ms: 360 }], EASE_TOSS),
        track(tossY, 5400, [{ to: -5, ms: 360 }, { to: 0, ms: 360 }, { to: -2, ms: 360 }, { to: 0, ms: 360 }], EASE_TOSS),

        track(foodRotate, 5400, [{ to: -4, ms: 360 }, { to: 3, ms: 450 }, { to: -2, ms: 360 }, { to: 0, ms: 450 }], EASE_TOSS),
        track(foodY, 5400, [{ to: -16, ms: 360 }, { to: -4, ms: 450 }, { to: -8, ms: 360 }, { to: 0, ms: 450 }], EASE_TOSS),

        track(bedOpacity, 270, [{ to: 1, ms: 90 }], EASE_DROP),
        track(bedY, 270, [{ to: 0, ms: 540 }, { to: -5, ms: 180 }, { to: 0, ms: 180 }], EASE_DROP),

        track(beefAOpacity, 720, [{ to: 1, ms: 90 }], EASE_DROP),
        track(beefAY, 720, [{ to: 0, ms: 540 }, { to: -7, ms: 180 }, { to: 0, ms: 180 }], EASE_DROP),
        track(beefBOpacity, 990, [{ to: 1, ms: 90 }], EASE_DROP),
        track(beefBY, 990, [{ to: 0, ms: 540 }, { to: -6, ms: 180 }, { to: 0, ms: 180 }], EASE_DROP),
        track(beefCOpacity, 1260, [{ to: 1, ms: 90 }], EASE_DROP),
        track(beefCY, 1260, [{ to: 0, ms: 540 }, { to: -5, ms: 180 }, { to: 0, ms: 180 }], EASE_DROP),

        track(brocAOpacity, 2340, [{ to: 1, ms: 90 }], EASE_DROP),
        track(brocAY, 2340, [{ to: 0, ms: 540 }, { to: -8, ms: 180 }, { to: 0, ms: 180 }], EASE_DROP),
        track(brocARotate, 2340, [{ to: 0, ms: 540 }, { to: 4, ms: 180 }, { to: 0, ms: 180 }], EASE_DROP),
        track(brocBOpacity, 2700, [{ to: 1, ms: 90 }], EASE_DROP),
        track(brocBY, 2700, [{ to: 0, ms: 540 }, { to: -7, ms: 180 }, { to: 0, ms: 180 }], EASE_DROP),
        track(brocBRotate, 2700, [{ to: 0, ms: 540 }, { to: -5, ms: 180 }, { to: 0, ms: 180 }], EASE_DROP),

        track(garnishOpacity, 3960, [{ to: 1, ms: 180 }], EASE_DROP),
        track(garnishY, 3960, [{ to: 0, ms: 630 }], EASE_DROP),

        track(bottleOpacity, 3780, [{ to: 1, ms: 270 }, { to: 1, ms: 1530 }, { to: 0, ms: 360 }], EASE_BOTTLE),
        track(bottleX, 3780, [{ to: 0, ms: 270 }, { to: 0, ms: 1530 }, { to: 26, ms: 360 }], EASE_BOTTLE),
        track(bottleY, 3780, [{ to: 0, ms: 270 }, { to: 0, ms: 1530 }, { to: -34, ms: 360 }], EASE_BOTTLE),
        track(bottleRotate, 4050, [{ to: -42, ms: 360 }, { to: -42, ms: 810 }, { to: 0, ms: 360 }], EASE_BOTTLE),

        track(steam1Opacity, 6840, [{ to: 0.55, ms: 720 }, { to: 0, ms: 1440 }], EASE_STEAM),
        track(steam1Y, 6840, [{ to: -6, ms: 720 }, { to: -20, ms: 1440 }], EASE_STEAM),
      ])
    );

    const steamCycle = (opacity: Animated.Value, y: Animated.Value) =>
      Animated.loop(
        Animated.parallel([
          track(opacity, 6840, [{ to: 0.55, ms: 720 }, { to: 0, ms: 1440 }], EASE_STEAM),
          track(y, 6840, [{ to: -6, ms: 720 }, { to: -20, ms: 1440 }], EASE_STEAM),
        ])
      );
    // Wisps 2 and 3 start their own identical 9s cycle after a one-time
    // lead-in delay (350ms/700ms, matching the source's CSS animation-delay
    // + fill-mode:backwards) -- a constant phase offset from the main loop
    // forever after, not baked into the shared 9000ms budget above.
    const steam2Loop = Animated.sequence([Animated.delay(350), steamCycle(steam2Opacity, steam2Y)]);
    const steam3Loop = Animated.sequence([Animated.delay(700), steamCycle(steam3Opacity, steam3Y)]);

    mainLoop.start();
    steam2Loop.start();
    steam3Loop.start();
    return () => {
      mainLoop.stop();
      steam2Loop.stop();
      steam3Loop.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Animated.Value refs are stable, only active/reduceMotion should restart the loop
  }, [active, reduceMotion]);

  return (
    <View style={styles.box}>
      <Svg viewBox="0 0 300 230" width={300} height={230} stroke="#111" strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" fill="none">
        <AnimatedG opacity={riseOpacity} translateY={riseY} scale={riseScale}>
          <AnimatedG rotation={tossRotate} translateY={tossY} originX={150} originY={150}>
            <Path d="M236 138 L292 122 L297 137 L242 156 Z" fill="#C090FF" />
            <Ellipse cx={150} cy={150} rx={95} ry={50} fill="#C090FF" />
            <Ellipse cx={150} cy={147} rx={82} ry={40} fill="#FFE9D4" />

            <AnimatedG opacity={bedOpacity} translateY={bedY}>
              <NoodleBed />
            </AnimatedG>

            <AnimatedG rotation={foodRotate} translateY={foodY} originX={150} originY={145}>
              <AnimatedG opacity={beefAOpacity} translateY={beefAY}>
                <BeefStrip x={110} y={124} w={38} h={19} rx={9.5} rotate={-9} origin={[129, 133.5]} mx={118} my={130} mw={22} mh={7} />
              </AnimatedG>
              <AnimatedG opacity={beefBOpacity} translateY={beefBY}>
                <BeefStrip x={146} y={141} w={40} h={19} rx={9.5} rotate={7} origin={[166, 150.5]} mx={155} my={147} mw={22} mh={7} />
              </AnimatedG>
              <AnimatedG opacity={beefCOpacity} translateY={beefCY}>
                <BeefStrip x={110} y={152} w={36} h={18} rx={9} rotate={12} origin={[128, 161]} mx={118} my={157.5} mw={20} mh={7} />
              </AnimatedG>
              <AnimatedG opacity={brocAOpacity} translateY={brocAY} rotation={brocARotate} originX={189} originY={140}>
                <BroccoliFloret
                  stalk="M181 138 L181 150 L196 150 L196 138 Z"
                  cloud="M170 130 C165 124 170 117 177 118 C177 111 186 108 190 113 C196 108 203 112 203 119 C210 119 213 127 207 132 C204 138 197 142 189 142 C180 142 173 137 170 130 Z"
                />
              </AnimatedG>
              <AnimatedG opacity={brocBOpacity} translateY={brocBY} rotation={brocBRotate} originX={127} originY={134}>
                <BroccoliFloret
                  stalk="M119 132 L119 143 L134 143 L134 132 Z"
                  cloud="M108 124 C103 118 108 111 115 112 C115 105 124 102 128 107 C134 102 141 106 141 113 C148 113 151 121 145 126 C142 132 135 136 127 136 C118 136 111 131 108 124 Z"
                />
              </AnimatedG>
              <AnimatedG opacity={garnishOpacity} translateY={garnishY}>
                <Circle cx={163} cy={166} r={3.4} fill="#FFD4AA" strokeWidth={2.4} />
                <Circle cx={196} cy={158} r={3.4} fill="#FFD4AA" strokeWidth={2.4} />
              </AnimatedG>
            </AnimatedG>
          </AnimatedG>
        </AnimatedG>

        <AnimatedG opacity={bottleOpacity} translateX={bottleX} translateY={bottleY} rotation={bottleRotate} originX={206} originY={112}>
          <SoySauceBottle />
        </AnimatedG>

        <Steam opacity={steam1Opacity} translateY={steam1Y} d="M126 106 C118 97 133 91 126 82" />
        <Steam opacity={steam2Opacity} translateY={steam2Y} d="M154 102 C146 92 161 85 154 74" />
        <Steam opacity={steam3Opacity} translateY={steam3Y} d="M182 106 C174 97 189 91 182 82" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: 300, height: 230, alignItems: 'center', justifyContent: 'center' },
});
