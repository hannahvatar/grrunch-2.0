import { router, useLocalSearchParams } from 'expo-router';
import { ArrowPathIcon } from 'react-native-heroicons/outline';

import { StatusScreen } from '../components/StatusScreen';

// {Provider} access was revoked -- the user disconnected Grrunch from
// their identity provider account (distinct from account deletion: the
// Grrunch account still exists, just unlinked). Generic across Apple/
// Google via the provider param, matching the {} templating pattern from
// error.tsx. Both actions return to Login for now, since there's no real
// reconnect flow beyond tapping the provider button again there.
export default function AccessRevokedScreen() {
  const { provider } = useLocalSearchParams<{ provider?: string }>();
  const providerName = provider || 'your sign-in provider';

  return (
    <StatusScreen
      icon={<ArrowPathIcon size={24} color="#999" />}
      title={`${providerName} access was revoked`}
      body={`You previously removed Grrunch from your ${providerName} ID. Reconnect to continue, or use a different sign-in method.`}
      actions={[
        { label: `Reconnect with ${providerName}`, onPress: () => router.back() },
        { label: 'Use a different method', onPress: () => router.back() },
      ]}
    />
  );
}
