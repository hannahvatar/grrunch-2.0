import { router } from 'expo-router';

import { StatusScreen } from '../components/StatusScreen';

// Account was deleted. "Create a new account" is a real destination
// (Login); "Restore account" doesn't have a real recovery flow built yet,
// so it falls back to returning to Login too, same as the other stubbed
// actions on these account-state screens.
export default function AccountDeletedScreen() {
  return (
    <StatusScreen
      icon="🗑"
      title="Account was deleted"
      body="This Grrunch account was previously deleted."
      actions={[
        { label: 'Create a new account', onPress: () => router.push('/login') },
        { label: 'Restore account', onPress: () => router.back() },
      ]}
    />
  );
}
