import { router, useLocalSearchParams } from 'expo-router';

import { StatusScreen } from '../components/StatusScreen';

// No Grrunch account found — the identity provider verified who the user
// is, but no Grrunch account is linked to it. Distinct from a generic
// error: retrying won't help, so the actions are deliberately different
// (switch method / recover / contact support) rather than "Try again".
// "Recover account" and "Contact support" don't have real destinations
// yet -- no recovery flow or support channel is built -- so they fall
// back to the same "return to Login" as the primary action for now.
export default function NoAccountScreen() {
  const { provider } = useLocalSearchParams<{ provider?: string }>();
  const providerName = provider || 'sign-in';

  return (
    <StatusScreen
      icon="🔎"
      title="No Grrunch account found"
      body={`We couldn't find the Grrunch account connected to this ${providerName} Account.`}
      actions={[
        { label: 'Try another sign-in method', onPress: () => router.back() },
        { label: 'Recover account', onPress: () => router.back() },
        { label: 'Contact support', variant: 'text', onPress: () => router.back() },
      ]}
    />
  );
}
