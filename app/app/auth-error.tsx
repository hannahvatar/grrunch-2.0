import { StatusScreen } from '../components/StatusScreen';

// Wireframe A3 — Apple auth error. Full-screen state for a genuine sign-in
// failure (not a cancellation, which stays a banner on the Login screen
// itself). Presented as a modal, matching upgrade.tsx/recipe.tsx.
export default function AuthErrorScreen() {
  return (
    <StatusScreen
      icon="!"
      title="Sign-in couldn't complete"
      body="We couldn't sign you in. Please try again."
    />
  );
}
