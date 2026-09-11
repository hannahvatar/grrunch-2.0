import { router } from 'expo-router';
import { CheckCircleIcon } from 'react-native-heroicons/outline';

import { StatusScreen } from '../components/StatusScreen';
import { usePurchases } from '../lib/purchases';
import { TRIAL_DAYS } from '../lib/subscription';

// Post-purchase success moment -- didn't exist at all before (Anabelle,
// 2026-09-11: 2nd of 4 UI-only paywall pieces to tackle while Apple/
// Google IAP wiring is still pending). upgrade.tsx's handlePrimaryAction
// used to go straight from a successful purchase/trial-start back to
// wherever the paywall was opened from, with no acknowledgment at all.
//
// Reuses StatusScreen (the same icon+title+body+action shell behind
// error.tsx/offline.tsx/etc.) rather than a new one-off layout -- this is
// a status moment like those, just a positive one, and it already has
// the safe-area-correct close button and DS-correct buttons built in.
//
// configured tells apart which action actually just happened, same
// distinction upgrade.tsx's own handlePrimaryAction makes: a real
// purchase (RevenueCat live) vs the DB-only trial fallback (RevenueCat
// not configured yet) -- everything today is the fallback, but this
// works unchanged once the store keys are live.
export default function SubscribedScreen() {
  const { configured } = usePurchases();

  return (
    <StatusScreen
      icon={<CheckCircleIcon size={32} color="#111" strokeWidth={1.5} />}
      title={configured ? 'Welcome to Grrunch Plus' : 'Your free trial has started'}
      body={
        configured
          ? "You're all set. Full deals, unlimited recipes, and grocery lists are yours."
          : `You have ${TRIAL_DAYS} days of full access — full deals, unlimited recipes, and grocery lists included.`
      }
      actions={[{ label: 'Start exploring', onPress: () => router.back() }]}
    />
  );
}
