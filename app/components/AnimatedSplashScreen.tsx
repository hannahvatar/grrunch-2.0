import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

// Animated app-launch splash -- shown by RootLayout (_layout.tsx) right after
// the native OS splash hides (once fonts are ready), for a minimum of
// MIN_DISPLAY_MS, then fades into the real app. This is a JS-side screen,
// not the native expo-splash-screen config (app.json's "expo-splash-screen"
// plugin) -- that native splash still covers the true cold-boot instant
// before any JS can run at all; this one takes over the instant JS mounts,
// so the two are complementary layers, not a replacement of one by the
// other. Ported from a design handoff (design_handoff_splash_screen/,
// 2026-09-07 zip) -- same approach as the onboarding animations
// (FlyerAnimation.tsx/SauteAnimation.tsx/LoyaltyCardStack.tsx): React
// Native's own Animated API (no Reanimated), keyframe timings/easings
// transcribed 1:1 from the handoff's spec.

const INK = '#1A1208';
const BODY_TEXT = '#4A3A26';
const DOT_IDLE = 'rgba(26,18,8,0.16)';

const MIN_DISPLAY_MS = 1600; // one full mascot pop + a couple of dot cycles
const POP_MS = 950;
const SPIN_MS = 7000;
const DOT_CYCLE_MS = 1350;
const EASE_POP = Easing.bezier(0.3, 0.7, 0.3, 1);
const EASE_TEXT = Easing.bezier(0.2, 0.8, 0.25, 1);
const EASE_DOT = Easing.inOut(Easing.ease);

// Splash-specific mascot artwork -- the handoff's own edited version of
// grrunch-illus-01.svg (the 4 floating decorative dots around the head
// removed, only the cheek dot kept) -- deliberately a separate asset from
// the shared GrrunchMascot.tsx component (which still uses the original,
// all-dots artwork elsewhere, e.g. terms.tsx), not a shared-component edit.
function SplashMascot({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 305 305" fill="none">
      <Path
        d="M152.341 35.5562L169.765 20L182.568 39.5376L203.421 29.0261L210.738 51.2104L233.603 46.4599L234.929 69.7829L258.246 71.11L253.491 93.9881L275.669 101.31L265.164 122.175L284.682 134.986L269.143 152.42L284.682 169.854L265.164 182.673L275.669 203.538L253.491 210.86L258.246 233.73L234.929 235.065L233.603 258.388L210.738 253.637L203.421 275.822L182.568 265.31L169.765 284.848L152.341 269.291L134.918 284.848L122.114 265.31L101.262 275.822L93.9441 253.637L71.0796 258.388L69.7532 235.065L46.4366 233.73L51.1919 210.86L29.0207 203.538L39.5185 182.673L20 169.854L35.5394 152.42L20 134.986L39.5185 122.175L29.0207 101.31L51.1919 93.9881L46.4366 71.11L69.7532 69.7829L71.0796 46.4599L93.9441 51.2104L101.262 29.0261L122.114 39.5376L134.918 20L152.341 35.5562Z"
        fill="#FF942A"
      />
      <Path d="M125.89 179.28C124.774 178.94 123.629 178.593 122.453 178.247L121.926 178.684L125.882 179.287L125.89 179.28Z" fill="white" />
      <Path
        d="M202.795 177.809L195.757 196.412L183.262 182.334L178.627 200.001L168.114 185.267C167.918 185.297 167.715 185.327 167.519 185.357L160.699 200.001L151.527 185.576C151.113 185.531 150.706 185.478 150.291 185.418L143.765 197.204L138.294 184.136C133.546 188.698 124.149 197.754 123.847 198.199L121.926 178.676L104.924 192.822L100.877 172.938C80.5148 171.92 89.9726 197.716 89.9726 197.716C89.9726 197.716 101.842 224.704 126.221 233.187C181.189 252.318 215.848 198.908 216.843 185.312C217.378 178.05 211.718 176.686 202.78 177.802L202.795 177.809Z"
        fill="black"
      />
      <Path d="M121.933 178.684L122.461 178.247C118.173 176.957 113.508 175.592 108.315 174.205C105.482 173.451 103.025 173.051 100.892 172.945L104.939 192.83L121.941 178.684H121.933Z" fill="white" />
      <Path d="M151.527 185.576L160.699 200.001L167.519 185.357C161.784 186.179 156.629 186.179 151.527 185.576Z" fill="white" />
      <Path
        d="M168.114 185.267L178.627 200.001L183.262 182.333L195.757 196.412L202.795 177.809C194.995 178.789 184.701 181.662 173.834 184.173C171.852 184.633 169.953 184.995 168.114 185.274V185.267Z"
        fill="white"
      />
      <Path
        d="M123.855 198.206C124.149 197.762 133.554 188.698 138.301 184.143L143.773 197.211L150.299 185.425C142.748 184.392 135.197 182.1 125.89 179.287L121.933 178.684L123.855 198.206Z"
        fill="white"
      />
      <Path d="M136.116 225.941C141.868 225.941 146.531 221.275 146.531 215.52C146.531 209.764 141.868 205.099 136.116 205.099C130.364 205.099 125.701 209.764 125.701 215.52C125.701 221.275 130.364 225.941 136.116 225.941Z" fill="#FF942A" />
      <Path d="M167.519 215.52C169.637 215.52 171.355 213.801 171.355 211.681C171.355 209.562 169.637 207.843 167.519 207.843C165.4 207.843 163.683 209.562 163.683 211.681C163.683 213.801 165.4 215.52 167.519 215.52Z" fill="#FF942A" />
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M75.31 93.6988L75.7418 89.1951L134.801 94.8656C134.802 94.8656 134.802 94.8656 134.586 97.1175C134.37 99.3693 134.37 99.3693 134.37 99.3692L75.31 93.6988Z"
        fill="black"
      />
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M198.527 79.4891C188.411 82.577 177.881 85.7911 176.227 86.2962L174.907 81.969C176.562 81.4637 187.092 78.2494 197.208 75.1616L217.026 69.1123C217.027 69.1122 217.027 69.1122 217.687 71.2759C218.346 73.4396 218.346 73.4397 218.346 73.4398L198.527 79.4891Z"
        fill="black"
      />
      <Path d="M104.216 153.725C120.456 153.725 133.622 140.551 133.622 124.301C133.622 108.051 120.456 94.8779 104.216 94.8779C87.9754 94.8779 74.81 108.051 74.81 124.301C74.81 140.551 87.9754 153.725 104.216 153.725Z" fill="white" />
      <Path d="M200.467 153.725C216.707 153.725 229.872 140.551 229.872 124.301C229.872 108.051 216.707 94.8779 200.467 94.8779C184.226 94.8779 171.061 108.051 171.061 124.301C171.061 140.551 184.226 153.725 200.467 153.725Z" fill="white" />
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M104.216 97.1401C89.224 97.1401 77.0708 109.301 77.0708 124.301C77.0708 139.302 89.224 151.462 104.216 151.462C119.207 151.462 131.361 139.302 131.361 124.301C131.361 109.301 119.207 97.1401 104.216 97.1401ZM72.5491 124.301C72.5491 106.802 86.7267 92.6158 104.216 92.6158C121.705 92.6158 135.882 106.802 135.882 124.301C135.882 141.801 121.705 155.987 104.216 155.987C86.7267 155.987 72.5491 141.801 72.5491 124.301ZM200.467 97.1401C185.475 97.1401 173.322 109.301 173.322 124.301C173.322 139.302 185.475 151.462 200.467 151.462C215.458 151.462 227.612 139.302 227.612 124.301C227.612 109.301 215.458 97.1401 200.467 97.1401ZM168.8 124.301C168.8 106.802 182.978 92.6158 200.467 92.6158C217.956 92.6158 232.133 106.802 232.133 124.301C232.133 141.801 217.956 155.987 200.467 155.987C182.978 155.987 168.8 141.801 168.8 124.301Z"
        fill="black"
      />
      <Path d="M103.794 127.966C105.912 127.966 107.63 126.248 107.63 124.128C107.63 122.008 105.912 120.29 103.794 120.29C101.675 120.29 99.9579 122.008 99.9579 124.128C99.9579 126.248 101.675 127.966 103.794 127.966Z" fill="black" />
      <Path d="M200.045 127.966C202.163 127.966 203.88 126.248 203.88 124.128C203.88 122.008 202.163 120.29 200.045 120.29C197.926 120.29 196.209 122.008 196.209 124.128C196.209 126.248 197.926 127.966 200.045 127.966Z" fill="black" />
      <Path d="M252.836 163.676C254.954 163.676 256.672 161.958 256.672 159.838C256.672 157.718 254.954 156 252.836 156C250.717 156 249 157.718 249 159.838C249 161.958 250.717 163.676 252.836 163.676Z" fill="black" />
    </Svg>
  );
}

export function AnimatedSplashScreen({ onDone }: { onDone: () => void }) {
  const [reduceMotion, setReduceMotion] = useState(false);

  const popOpacity = useRef(new Animated.Value(0)).current;
  const popScale = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  const wordOpacity = useRef(new Animated.Value(0)).current;
  const wordY = useRef(new Animated.Value(8)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineY = useRef(new Animated.Value(8)).current;

  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  const containerOpacity = useRef(new Animated.Value(1)).current;

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
    const exit = () => {
      Animated.timing(containerOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(onDone);
    };

    if (reduceMotion) {
      // Respect reduce-motion: static mascot, no spin, no pop overshoot,
      // low-amplitude opacity-only dot pulse, text just present.
      popOpacity.setValue(1);
      popScale.setValue(1);
      wordOpacity.setValue(1);
      wordY.setValue(0);
      taglineOpacity.setValue(1);
      taglineY.setValue(0);
      const lowAmpPulse = (d: Animated.Value, delay: number) =>
        Animated.sequence([
          Animated.delay(delay),
          Animated.loop(
            Animated.sequence([
              Animated.timing(d, { toValue: 1, duration: 675, easing: EASE_DOT, useNativeDriver: false }),
              Animated.timing(d, { toValue: 0.4, duration: 675, easing: EASE_DOT, useNativeDriver: false }),
            ])
          ),
        ]);
      const loops = [lowAmpPulse(dot1, 0), lowAmpPulse(dot2, 180), lowAmpPulse(dot3, 360)];
      loops.forEach((l) => l.start());
      const t = setTimeout(exit, MIN_DISPLAY_MS);
      return () => {
        loops.forEach((l) => l.stop());
        clearTimeout(t);
      };
    }

    // Mascot pop-in: opacity 0->1 by 45%, scale through an overshoot-settle
    // curve (0 -> 1.18 -> 0.90 -> 1.06 -> 0.98 -> 1.00).
    const popSeq = Animated.sequence([
      Animated.parallel([
        Animated.timing(popOpacity, { toValue: 1, duration: POP_MS * 0.45, easing: EASE_POP, useNativeDriver: true }),
        Animated.timing(popScale, { toValue: 1.18, duration: POP_MS * 0.45, easing: EASE_POP, useNativeDriver: true }),
      ]),
      Animated.timing(popScale, { toValue: 0.9, duration: POP_MS * 0.17, easing: EASE_POP, useNativeDriver: true }),
      Animated.timing(popScale, { toValue: 1.06, duration: POP_MS * 0.16, easing: EASE_POP, useNativeDriver: true }),
      Animated.timing(popScale, { toValue: 0.98, duration: POP_MS * 0.12, easing: EASE_POP, useNativeDriver: true }),
      Animated.timing(popScale, { toValue: 1.0, duration: POP_MS * 0.1, easing: EASE_POP, useNativeDriver: true }),
    ]);

    // Continuous clockwise spin, starts as the pop settles, runs forever.
    const spinLoop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: SPIN_MS, easing: Easing.linear, useNativeDriver: true }));
    const spinDelay = setTimeout(() => spinLoop.start(), POP_MS);

    const wordSeq = Animated.parallel([
      Animated.timing(wordOpacity, { toValue: 1, duration: 600, delay: 120, easing: EASE_TEXT, useNativeDriver: true }),
      Animated.timing(wordY, { toValue: 0, duration: 600, delay: 120, easing: EASE_TEXT, useNativeDriver: true }),
    ]);
    const taglineSeq = Animated.parallel([
      Animated.timing(taglineOpacity, { toValue: 1, duration: 600, delay: 240, easing: EASE_TEXT, useNativeDriver: true }),
      Animated.timing(taglineY, { toValue: 0, duration: 600, delay: 240, easing: EASE_TEXT, useNativeDriver: true }),
    ]);

    // Dots: 0->30% brighten+grow, 30->60% fade back, 60->100% idle hold --
    // each wisp offset by a one-time leading delay (0/180/360ms), same
    // constant-phase-offset pattern as SauteAnimation's steam wisps.
    const dotCycle = (d: Animated.Value) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(d, { toValue: 1, duration: DOT_CYCLE_MS * 0.3, easing: EASE_DOT, useNativeDriver: false }),
          Animated.timing(d, { toValue: 0, duration: DOT_CYCLE_MS * 0.3, easing: EASE_DOT, useNativeDriver: false }),
          Animated.delay(DOT_CYCLE_MS * 0.4),
        ])
      );
    const dot1Loop = Animated.sequence([Animated.delay(0), dotCycle(dot1)]);
    const dot2Loop = Animated.sequence([Animated.delay(180), dotCycle(dot2)]);
    const dot3Loop = Animated.sequence([Animated.delay(360), dotCycle(dot3)]);

    popSeq.start();
    wordSeq.start();
    taglineSeq.start();
    dot1Loop.start();
    dot2Loop.start();
    dot3Loop.start();

    const t = setTimeout(exit, MIN_DISPLAY_MS);

    return () => {
      popSeq.stop();
      spinLoop.stop();
      clearTimeout(spinDelay);
      wordSeq.stop();
      taglineSeq.stop();
      dot1Loop.stop();
      dot2Loop.stop();
      dot3Loop.stop();
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Animated.Value refs are stable, onDone is only read at exit time
  }, [reduceMotion]);

  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  function renderDot(d: Animated.Value) {
    const backgroundColor = d.interpolate({ inputRange: [0, 1], outputRange: [DOT_IDLE, INK] });
    const scale = d.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
    return <Animated.View style={[styles.dot, { backgroundColor, transform: [{ scale }] }]} />;
  }

  return (
    <Animated.View style={[styles.fill, { opacity: containerOpacity }]}>
      {/* Matches every other screen's gradient (index.tsx/terms.tsx/login.tsx)
          instead of the handoff's own distinct 3-stop diagonal -- Anabelle's
          call, for consistency across the app (and it happened to clear up
          an uneven-looking "inner shadow" the diagonal 3-stop version had). */}
      <LinearGradient colors={['#fff', '#FFEAD4']} style={styles.fill}>
        <View style={styles.center}>
          <Animated.View style={{ opacity: popOpacity, transform: [{ scale: popScale }] }}>
            <Animated.View style={{ transform: [{ rotate: spinDeg }] }}>
              <SplashMascot size={208} />
            </Animated.View>
          </Animated.View>
          <View style={styles.textBlock}>
            <Animated.Text style={[styles.wordmark, { opacity: wordOpacity, transform: [{ translateY: wordY }] }]}>GRRUNCH</Animated.Text>
            <Animated.Text style={[styles.tagline, { opacity: taglineOpacity, transform: [{ translateY: taglineY }] }]}>
              Hang tight, we’re turning your deals into delicious meals
            </Animated.Text>
          </View>
        </View>
        <View style={styles.loader}>
          {renderDot(dot1)}
          {renderDot(dot2)}
          {renderDot(dot3)}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: -40, paddingHorizontal: 40 },
  textBlock: { marginTop: 34, alignItems: 'center', gap: 14 },
  wordmark: {
    fontSize: 40,
    fontWeight: '800',
    fontFamily: 'OpenSans_800ExtraBold',
    letterSpacing: -0.8,
    lineHeight: 40,
    color: INK,
  },
  tagline: {
    fontSize: 19,
    fontWeight: '700',
    fontFamily: 'OpenSans_700Bold',
    color: BODY_TEXT,
    textAlign: 'center',
    lineHeight: 27.5,
    maxWidth: 280,
  },
  loader: {
    position: 'absolute',
    bottom: 68,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
});
