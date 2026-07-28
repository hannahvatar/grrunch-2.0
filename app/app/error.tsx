import { useLocalSearchParams } from 'expo-router';

import { StatusScreen } from '../components/StatusScreen';

// Wireframe A6 — generic backend-error screen, usable app-wide (not
// sign-in specific) wherever a backend call fails. Supersedes the earlier
// auth-error.tsx, same reasoning as the service-unavailable consolidation:
// minimize error screen variations, use one generic screen with optional
// context instead of a dedicated screen per call site. Callers pass title/
// body/footnote via route params only when they have something more
// specific to say; otherwise it falls back to a fully generic message.
export default function ErrorScreen() {
  const { title, body, footnote } = useLocalSearchParams<{
    title?: string;
    body?: string;
    footnote?: string;
  }>();

  return (
    <StatusScreen
      icon="!"
      title={title || 'Something went wrong'}
      body={body || 'Something went wrong. Please try again.'}
      footnote={footnote}
    />
  );
}
