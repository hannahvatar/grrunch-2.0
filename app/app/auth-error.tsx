import { useLocalSearchParams } from 'expo-router';

import { StatusScreen } from '../components/StatusScreen';

// Generic sign-in failure state -- covers any non-cancellation error across
// Apple/Google/email (offline has its own screen since that's a genuinely
// distinct, real signal; everything else collapses to this one). Provider
// is an optional route param for a little context, but the copy stays
// deliberately non-specific about cause: none of Apple's real error codes
// (checked expo-apple-authentication's full list) distinguish "service
// unavailable" from any other failure, so claiming a specific cause here
// would be a guess dressed up as a fact. Presented as a modal, matching
// upgrade.tsx/recipe.tsx.
export default function AuthErrorScreen() {
  const { provider } = useLocalSearchParams<{ provider?: string }>();

  return (
    <StatusScreen
      icon="!"
      title="Sign-in couldn't complete"
      body={
        provider
          ? `We couldn't sign you in with ${provider}. Please try again.`
          : "We couldn't sign you in. Please try again."
      }
    />
  );
}
