import { SignalSlashIcon } from 'react-native-heroicons/outline';

import { StatusScreen } from '../components/StatusScreen';

// Sign-in offline path. Shown when a network check fails before attempting
// Apple/Google/email sign-in. Presented as a modal, matching error.tsx.
export default function OfflineScreen() {
  return (
    <StatusScreen
      icon={<SignalSlashIcon size={24} color="#999" />}
      title="You're offline"
      body="Check your connection and try again."
    />
  );
}
