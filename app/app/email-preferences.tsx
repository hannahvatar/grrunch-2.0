import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { EnvelopeIcon } from 'react-native-heroicons/outline';

import { StatusScreen } from '../components/StatusScreen';
import { HOME_ROUTE } from '../lib/layout';
import { supabase } from '../lib/supabase';

// Where the weekly email's "Unsubscribe" and "Keep them coming" links
// land (2026-11-03), no sign-in needed: the link's own signed u/t is
// checked by supabase/functions/weekly-email-preferences. Nothing changes
// until the button here is pressed, so a mail app or spam filter opening
// the link on its own can't unsubscribe or subscribe anyone.
type Action = 'stop' | 'keep';
type State = 'ask' | 'saving' | 'done' | 'error';

export default function EmailPreferencesScreen() {
  const params = useLocalSearchParams<{ a?: string; u?: string; t?: string }>();
  const action: Action = params.a === 'keep' ? 'keep' : 'stop';
  const [state, setState] = useState<State>('ask');

  async function confirm() {
    setState('saving');
    const { error } = await supabase.functions.invoke('weekly-email-preferences', {
      body: { u: params.u, t: params.t, action },
    });
    setState(error ? 'error' : 'done');
  }

  const openGrrunch = { label: 'Open Grrunch', variant: 'secondary' as const, onPress: () => router.replace(HOME_ROUTE) };

  if (!params.u || !params.t || state === 'error') {
    return (
      <StatusScreen
        icon={<EnvelopeIcon size={32} color="#111" />}
        title="This link didn't work"
        body="You can change your emails in Profile, under Notifications, or write to support@grrunch.com."
        actions={[{ ...openGrrunch, variant: 'primary' }]}
      />
    );
  }

  if (state === 'done') {
    return (
      <StatusScreen
        icon={<EnvelopeIcon size={32} color="#111" />}
        title={action === 'keep' ? "You're in!" : "You're unsubscribed"}
        body={
          action === 'keep'
            ? "We'll email you every Thursday when new deals and recipes are live."
            : "You won't get the weekly email anymore. You can turn it back on in Profile, under Notifications."
        }
        actions={[{ ...openGrrunch, variant: 'primary' }]}
      />
    );
  }

  return (
    <StatusScreen
      icon={<EnvelopeIcon size={32} color="#111" />}
      title={action === 'keep' ? 'Keep the weekly email?' : 'Unsubscribe from weekly emails?'}
      body={
        action === 'keep'
          ? 'Every Thursday: the new deals from BC stores and recipes that make the most of them.'
          : "You'll stop getting the Thursday email with new deals and recipes."
      }
      actions={[
        {
          label: state === 'saving' ? 'Saving...' : action === 'keep' ? 'Yes, keep them coming' : 'Unsubscribe',
          variant: 'primary',
          onPress: state === 'saving' ? undefined : confirm,
        },
        openGrrunch,
      ]}
    />
  );
}
