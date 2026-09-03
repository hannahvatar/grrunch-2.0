import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FlyerAnimation } from '../components/FlyerAnimation';
import { GrrunchMascot } from '../components/GrrunchMascot';

// GRRUNCH DS accent -- matches terms.tsx/login.tsx's palette.
const ACCENT = '#FFA955';
const INK = '#111';

// Value-prop copy, Anabelle's own wording -- rewritten + reordered
// 2026-09-03 (was: member prices / deal-hunting / meal planning, in that
// order). No Figma wireframe for this screen, so layout/pagination below
// is Claude's own call, not a matched design.
const SLIDES = [
  {
    headline: 'Skip the deal hunting',
    body: 'Every week, we scan grocery flyers and pick out the deals actually worth buying.',
  },
  {
    headline: 'Let the deals decide dinner',
    body: "We turn the week's best deals into affordable recipes and your meal plan.",
  },
  {
    headline: 'Member prices count, too',
    body: 'Some of our deals include loyalty pricing, so keep your grocery rewards cards handy.',
  },
] as const;

// The "Skip the deal hunting" slide gets the animated flyer illustration
// (see FlyerAnimation.tsx) instead of the mascot every other slide uses --
// keyed to the headline text, not a hardcoded index, so a future reorder
// can't silently point this at the wrong slide.
const FLYER_SLIDE = SLIDES.findIndex((s) => s.headline === 'Skip the deal hunting');

// New first screen (2026-09-03) — value-prop onboarding carousel, ahead of
// the pre-existing Terms & consent screen (moved to terms.tsx unchanged).
// Deliberately shown on every cold start, same as the rest of this guest-mode
// intro sequence (Terms/Login aren't gated behind "seen once" state either)
// -- not stored/persisted anywhere. Skippable at every step per Anabelle's
// call; jumps straight to /terms either way.
export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const isLast = step === SLIDES.length - 1;
  const slide = SLIDES[step];

  function next() {
    if (isLast) {
      router.push('/terms');
    } else {
      setStep((s) => s + 1);
    }
  }

  return (
    <LinearGradient colors={['#fff', '#FFEAD4']} style={styles.gradient}>
      <View style={styles.container}>
        <Pressable style={styles.skip} onPress={() => router.push('/terms')} hitSlop={12}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>

        {/* ScrollView, not a fixed-height flex-centered View -- guards the
            same overflow-behind-the-button risk found live on terms.tsx
            (see its own comment). flexGrow:1 on contentContainerStyle
            keeps it centered when it fits, scrolls when it doesn't. */}
        <ScrollView contentContainerStyle={styles.middle} showsVerticalScrollIndicator={false}>
          <View style={styles.logo}>
            {step === FLYER_SLIDE ? <FlyerAnimation active={step === FLYER_SLIDE} /> : <GrrunchMascot size={160} />}
          </View>
          <Text style={styles.headline}>{slide.headline}</Text>
          <Text style={styles.body}>{slide.body}</Text>
        </ScrollView>

        {/* bottom block is pinned via its own paddingBottom (not flex
            centering) so the button always clears SupportBubble's fixed
            right:20/bottom:96, 52px footprint -- same reasoning as the
            paddingBottom fix on GroceryListView's Total card. */}
        <View style={styles.bottomBlock}>
          <View style={styles.dots}>
            {SLIDES.map((s, i) => (
              <View key={s.headline} style={[styles.dot, i === step && styles.dotActive]} />
            ))}
          </View>

          <Pressable
            onPress={next}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          >
            <Text style={styles.primaryButtonText}>{isLast ? 'Get started' : 'Next'}</Text>
          </Pressable>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1, padding: 24 },
  skip: { position: 'absolute', top: 60, right: 24, padding: 8, zIndex: 1 },
  skipText: { fontSize: 15, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold', color: '#343837' },
  middle: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  logo: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  headline: {
    fontSize: 24,
    fontWeight: '800',
    fontFamily: 'OpenSans_800ExtraBold',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', color: '#343837' },
  bottomBlock: { paddingBottom: 160 },
  dots: { flexDirection: 'row', gap: 8, marginBottom: 24, alignSelf: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E0C9AE' },
  dotActive: { backgroundColor: INK, width: 20 },
  primaryButton: {
    width: '100%',
    height: 56,
    justifyContent: 'center',
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 28,
    alignItems: 'center',
  },
  primaryButtonPressed: { borderColor: INK },
  primaryButtonText: { color: INK, fontSize: 17, fontWeight: '700', fontFamily: 'OpenSans_700Bold' },
});
