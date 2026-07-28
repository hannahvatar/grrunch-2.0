import { router } from 'expo-router';

import { StatusScreen } from '../components/StatusScreen';

// Account unavailable (suspended). Deliberately vague about why -- "Contact
// support" is the only sensible action, since "Try again" would be wrong
// (retrying can't fix a suspension). No real support channel is built yet,
// so it falls back to "return to Login" for now.
export default function AccountUnavailableScreen() {
  return (
    <StatusScreen
      icon="🔒"
      title="Account unavailable"
      body="Your account is currently unavailable. Contact support for help."
      actions={[{ label: 'Contact support', onPress: () => router.back() }]}
    />
  );
}
