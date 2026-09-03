import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';

// Onboarding slide 3 ("Member prices count, too") illustration -- three
// loyalty cards, one centered up front and the other two peeking behind it;
// every 3s the front card turns away and the next one comes forward,
// looping forever. Same build as FlyerAnimation.tsx/SauteAnimation.tsx
// (design_handoff_onboarding_flyer/, 2026-09-03 zip, slide 3 addition) --
// React Native's own Animated API, no Reanimated, keyframes transcribed 1:1
// from the handoff's CSS.
//
// These are plain text-and-colour cards, not real loyalty-card designs --
// no store logos or brand marks, per the handoff's own note.

const CARD_EASE = Easing.bezier(0.45, 0, 0.2, 1);
const EASE_RISE = Easing.bezier(0.16, 0.84, 0.3, 1);

// The 3 slot positions a card can sit in (translateX/Y, rotateY deg, scale).
const FRONT = { x: 0, y: 0, rot: 0, scale: 1 };
const PEEK_RIGHT = { x: 46, y: 10, rot: -26, scale: 0.82 };
const PEEK_LEFT = { x: -46, y: 10, rot: 26, scale: 0.82 };

// Hold ~2.4s in a slot, then ~0.6s to move to the next -- these 3 durations
// are the exact transcription of the source's 26.7%/33.3%/60%/66.6%/93.3%
// breakpoints (times 90ms per %), and sum to exactly 9000ms.
const HOLD = 2403;
const MOVE1 = 594;
const MOVE2 = 594;
const MOVE3 = 603;

// One card's position cycle: hold at v0, move to v1, hold, move to v2, hold,
// move back to v0 (seamless loop point). Used once per transform property
// (x/y/rotate/scale), each called with that card's own 3 slot values.
function posTrack(value: Animated.Value, v0: number, v1: number, v2: number) {
  return Animated.sequence([
    Animated.delay(HOLD),
    Animated.timing(value, { toValue: v1, duration: MOVE1, easing: CARD_EASE, useNativeDriver: true }),
    Animated.delay(HOLD),
    Animated.timing(value, { toValue: v2, duration: MOVE2, easing: CARD_EASE, useNativeDriver: true }),
    Animated.delay(HOLD),
    Animated.timing(value, { toValue: v0, duration: MOVE3, easing: CARD_EASE, useNativeDriver: true }),
  ]);
}

// z-index only flips at the 2 instants a card enters/leaves the front slot
// (an instant JS-side flip, not an eased transition -- CSS doesn't animate
// z-index either, it just steps). The exact source insight worth
// preserving: the INCOMING card rises to z:5 right as it starts moving
// toward front (not once it arrives), and the OUTGOING card drops to z:1
// right as it starts leaving -- getting this backwards is what made the
// original prototype's loop visibly "cut" when a card came back to front.
function zTrack(value: Animated.Value, startZ: number, endZ: number, holdBeforeFlip: number, holdAfterFlip: number) {
  return Animated.sequence([
    Animated.delay(holdBeforeFlip),
    Animated.timing(value, { toValue: endZ, duration: 0, useNativeDriver: false }),
    Animated.delay(holdAfterFlip),
    Animated.timing(value, { toValue: startZ, duration: 0, useNativeDriver: false }),
    Animated.delay(9000 - holdBeforeFlip - holdAfterFlip),
  ]);
}

type CardAnim = {
  x: Animated.Value;
  y: Animated.Value;
  rot: Animated.Value;
  scale: Animated.Value;
  z: Animated.Value;
};

function useCardAnim(initial: { x: number; y: number; rot: number; scale: number; z: number }): CardAnim {
  return {
    x: useRef(new Animated.Value(initial.x)).current,
    y: useRef(new Animated.Value(initial.y)).current,
    rot: useRef(new Animated.Value(initial.rot)).current,
    scale: useRef(new Animated.Value(initial.scale)).current,
    z: useRef(new Animated.Value(initial.z)).current,
  };
}

function LoyaltyCard({ anim, color, name }: { anim: CardAnim; color: string; name: string }) {
  const rotateDeg = anim.rot.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] });
  return (
    <Animated.View
      style={[
        styles.cardWrap,
        {
          zIndex: anim.z,
          transform: [
            { perspective: 900 },
            { translateX: anim.x },
            { translateY: anim.y },
            { rotateY: rotateDeg },
            { scale: anim.scale },
          ],
        },
      ]}
    >
      <View style={[styles.card, { backgroundColor: color }]}>
        <View style={styles.magstripe} />
        <Text style={styles.cardName}>{name}</Text>
        <View style={styles.barcode}>
          {[2, 4, 2, 3, 5, 2, 3].map((w, i) => (
            <View key={i} style={{ width: w, height: [14, 10, 14, 8, 14, 11, 14][i], backgroundColor: '#111' }} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

export function LoyaltyCardStack({ active }: { active: boolean }) {
  const [reduceMotion, setReduceMotion] = useState(false);

  const introOpacity = useRef(new Animated.Value(0)).current;
  const introY = useRef(new Animated.Value(16)).current;

  // Card A (PC Optimum): front -> peek-right -> peek-left -> front.
  const cardA = useCardAnim({ ...FRONT, z: 5 });
  // Card B (Scene+): peek-left -> front -> peek-right -> peek-left.
  const cardB = useCardAnim({ ...PEEK_LEFT, z: 1 });
  // Card C (Save-on-Food): peek-right -> peek-left -> front -> peek-right.
  const cardC = useCardAnim({ ...PEEK_RIGHT, z: 1 });

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
      introOpacity.setValue(1);
      introY.setValue(0);
      cardA.x.setValue(FRONT.x);
      cardA.y.setValue(FRONT.y);
      cardA.rot.setValue(FRONT.rot);
      cardA.scale.setValue(FRONT.scale);
      cardA.z.setValue(5);
      cardB.x.setValue(PEEK_LEFT.x);
      cardB.y.setValue(PEEK_LEFT.y);
      cardB.rot.setValue(PEEK_LEFT.rot);
      cardB.scale.setValue(PEEK_LEFT.scale);
      cardB.z.setValue(1);
      cardC.x.setValue(PEEK_RIGHT.x);
      cardC.y.setValue(PEEK_RIGHT.y);
      cardC.rot.setValue(PEEK_RIGHT.rot);
      cardC.scale.setValue(PEEK_RIGHT.scale);
      cardC.z.setValue(1);
      return;
    }
    if (!active) return;

    introOpacity.setValue(0);
    introY.setValue(16);
    cardA.x.setValue(FRONT.x);
    cardA.y.setValue(FRONT.y);
    cardA.rot.setValue(FRONT.rot);
    cardA.scale.setValue(FRONT.scale);
    cardA.z.setValue(5);
    cardB.x.setValue(PEEK_LEFT.x);
    cardB.y.setValue(PEEK_LEFT.y);
    cardB.rot.setValue(PEEK_LEFT.rot);
    cardB.scale.setValue(PEEK_LEFT.scale);
    cardB.z.setValue(1);
    cardC.x.setValue(PEEK_RIGHT.x);
    cardC.y.setValue(PEEK_RIGHT.y);
    cardC.rot.setValue(PEEK_RIGHT.rot);
    cardC.scale.setValue(PEEK_RIGHT.scale);
    cardC.z.setValue(1);

    // Intro rise runs ONCE (not looped) -- the cards are already cycling in
    // their correct slots underneath it from t=0, so the loop reads as
    // seamless once the group has faded/slid in.
    const intro = Animated.timing(introOpacity, { toValue: 1, duration: 900, easing: EASE_RISE, useNativeDriver: true });
    const introMove = Animated.timing(introY, { toValue: 0, duration: 900, easing: EASE_RISE, useNativeDriver: true });

    const cycleA = Animated.loop(
      Animated.parallel([
        posTrack(cardA.x, FRONT.x, PEEK_RIGHT.x, PEEK_LEFT.x),
        posTrack(cardA.y, FRONT.y, PEEK_RIGHT.y, PEEK_LEFT.y),
        posTrack(cardA.rot, FRONT.rot, PEEK_RIGHT.rot, PEEK_LEFT.rot),
        posTrack(cardA.scale, FRONT.scale, PEEK_RIGHT.scale, PEEK_LEFT.scale),
        zTrack(cardA.z, 5, 1, HOLD, 8397 - HOLD),
      ])
    );
    const cycleB = Animated.loop(
      Animated.parallel([
        posTrack(cardB.x, PEEK_LEFT.x, FRONT.x, PEEK_RIGHT.x),
        posTrack(cardB.y, PEEK_LEFT.y, FRONT.y, PEEK_RIGHT.y),
        posTrack(cardB.rot, PEEK_LEFT.rot, FRONT.rot, PEEK_RIGHT.rot),
        posTrack(cardB.scale, PEEK_LEFT.scale, FRONT.scale, PEEK_RIGHT.scale),
        zTrack(cardB.z, 1, 5, HOLD, 5400 - HOLD),
      ])
    );
    const cycleC = Animated.loop(
      Animated.parallel([
        posTrack(cardC.x, PEEK_RIGHT.x, PEEK_LEFT.x, FRONT.x),
        posTrack(cardC.y, PEEK_RIGHT.y, PEEK_LEFT.y, FRONT.y),
        posTrack(cardC.rot, PEEK_RIGHT.rot, PEEK_LEFT.rot, FRONT.rot),
        posTrack(cardC.scale, PEEK_RIGHT.scale, PEEK_LEFT.scale, FRONT.scale),
        zTrack(cardC.z, 1, 5, 5400, 8397 - 5400),
      ])
    );

    intro.start();
    introMove.start();
    cycleA.start();
    cycleB.start();
    cycleC.start();
    return () => {
      intro.stop();
      introMove.stop();
      cycleA.stop();
      cycleB.stop();
      cycleC.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Animated.Value refs are stable, only active/reduceMotion should restart the loop
  }, [active, reduceMotion]);

  return (
    <View style={styles.box}>
      <Animated.View style={{ opacity: introOpacity, transform: [{ translateY: introY }] }}>
        <View style={styles.stack}>
          <LoyaltyCard anim={cardA} color="#FFA955" name="PC Optimum" />
          <LoyaltyCard anim={cardB} color="#96E696" name="Scene+" />
          <LoyaltyCard anim={cardC} color="#D5B5FF" name="Save-on-Food" />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: 300, height: 230, alignItems: 'center', justifyContent: 'center' },
  stack: { width: 300, height: 230 },
  cardWrap: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 128,
    height: 202,
    marginLeft: -64,
    marginTop: -101,
  },
  card: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#111',
    borderRadius: 12,
    padding: 11,
    justifyContent: 'space-between',
  },
  magstripe: { height: 14, backgroundColor: '#111', borderRadius: 1 },
  cardName: { fontSize: 15, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', lineHeight: 17, color: '#111' },
  barcode: { flexDirection: 'row', gap: 2, alignItems: 'flex-end', height: 14 },
});
