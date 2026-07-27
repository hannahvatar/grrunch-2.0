import { StatusScreen } from '../components/StatusScreen';

// Sign-in offline path. Shown when a network check fails before attempting
// Apple/Google/email sign-in. Presented as a modal, matching auth-error.tsx.
export default function OfflineScreen() {
  return (
    <StatusScreen
      icon="🚫"
      title="You're offline"
      body="Check your connection and try again."
    />
  );
}
