import { useLocalSearchParams } from 'expo-router';

import { StatusScreen } from '../components/StatusScreen';

// Sign in unavailable service. Generic across Apple/Google/email -- the
// provider name is a route param so one screen covers all three, matching
// the {Provider} templating in the wireframe. Presented as a modal, same
// as auth-error.tsx/offline.tsx.
export default function ServiceUnavailableScreen() {
  const { provider } = useLocalSearchParams<{ provider?: string }>();
  const providerName = provider || 'Sign-in';

  return (
    <StatusScreen
      icon="🔌"
      title={`${providerName} service unavailable`}
      body={`Sign in with ${providerName} is temporarily unavailable. Please try again later.`}
    />
  );
}
