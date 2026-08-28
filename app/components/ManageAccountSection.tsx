import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../lib/auth';
import { deleteAccount, fetchProfile, Profile, saveProfile } from '../lib/profile';
import { supabase } from '../lib/supabase';
import { InputField } from './InputField';
import { SignInOrTrialPrompt } from './SignInOrTrialPrompt';

const ACCENT = '#FFA955';
const INK = '#111';
const ERROR = '#D0342C';

// Manage account's expanded content, inside settings.tsx's accordion row.
// Real, wired up: personal info reads/writes public.users (see
// lib/profile.ts), security shows the real signed-in method and calls the
// real supabase.auth.signOut() / delete-account Edge Function. Deliberately
// does NOT show Password/Passkey/Authenticator app/2-step verification --
// this app's real auth is Apple/Google OAuth + email magic-link, there's no
// password anywhere in that flow, so those rows would be fabricated
// (Anabelle's call, 2026-08-28).
export function ManageAccountSection() {
  const { session, isGuest } = useAuth();

  if (isGuest) {
    // Manage account is gated on having an account at all, not just a
    // subscription (Saved recipes/Companion recipes' UpgradeCta is), so a
    // guest gets both real paths forward -- Anabelle's mockup, 2026-08-28.
    return (
      <View style={styles.wrap}>
        <SignInOrTrialPrompt reason="manage your account" />
      </View>
    );
  }

  return <ManageAccountForm userId={session!.user.id} email={session!.user.email ?? null} provider={session!.user.app_metadata?.provider} />;
}

function providerLabel(provider: unknown): string {
  if (provider === 'apple') return 'Apple';
  if (provider === 'google') return 'Google';
  if (provider === 'email') return 'Email';
  return 'your account';
}

function ManageAccountForm({ userId, email, provider }: { userId: string; email: string | null; provider: unknown }) {
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<Profile>({ fullName: null, phone: null });
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchProfile(userId).then(({ profile }) => {
      if (cancelled) return;
      setSaved(profile ?? { fullName: null, phone: null });
      setFullName(profile?.fullName ?? '');
      setPhone(profile?.phone ?? '');
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const dirty = fullName !== (saved.fullName ?? '') || phone !== (saved.phone ?? '');

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    const { error } = await saveProfile(userId, email, {
      fullName: fullName.trim() || null,
      phone: phone.trim() || null,
    });
    setSaving(false);
    if (error) {
      setSaveError(error);
      return;
    }
    setSaved({ fullName: fullName.trim() || null, phone: phone.trim() || null });
    setSaveSuccess(true);
  }

  function handleSignOut() {
    supabase.auth.signOut();
    router.replace('/login');
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete your account?',
      "This permanently deletes your account and everything saved to it. This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            setDeleteError(null);
            const { error } = await deleteAccount();
            setDeleting(false);
            if (error) {
              setDeleteError(error);
              return;
            }
            await supabase.auth.signOut();
            router.replace('/login');
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.wrap}>
        <ActivityIndicator color={INK} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.subheading}>Personal info</Text>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Name</Text>
        <InputField placeholder="Your name" value={fullName} onChangeText={setFullName} />
      </View>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Phone number</Text>
        <InputField placeholder="Phone number" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      </View>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Email</Text>
        <View style={styles.readOnlyField}>
          <Text style={styles.readOnlyText}>{email ?? '—'}</Text>
        </View>
      </View>
      {saveError && <Text style={styles.errorText}>{saveError}</Text>}
      {saveSuccess && !dirty && <Text style={styles.successText}>Saved.</Text>}
      <Pressable
        style={[styles.saveButton, (!dirty || saving) && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={!dirty || saving}
      >
        {saving ? <ActivityIndicator color={INK} /> : <Text style={styles.saveButtonText}>Save</Text>}
      </Pressable>

      <View style={styles.divider} />

      <Text style={styles.subheading}>Security</Text>
      <Text style={styles.securityText}>Signed in with {providerLabel(provider)}</Text>
      <Pressable style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutButtonText}>Sign out</Text>
      </Pressable>
      {deleteError && <Text style={styles.errorText}>{deleteError}</Text>}
      <Pressable style={styles.deleteButton} onPress={handleDeleteAccount} disabled={deleting} hitSlop={8}>
        {deleting ? (
          <ActivityIndicator color={ERROR} />
        ) : (
          <Text style={styles.deleteButtonText}>Delete account</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, gap: 12 },
  subheading: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK, marginBottom: 10 },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', fontFamily: 'OpenSans_600SemiBold', color: INK, marginBottom: 6 },
  readOnlyField: {
    backgroundColor: '#F2F2F2',
    borderWidth: 1.5,
    borderColor: '#C7C7C7',
    borderRadius: 28,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  readOnlyText: { fontSize: 16, color: '#666' },
  errorText: { fontSize: 13, color: ERROR, marginBottom: 8 },
  successText: { fontSize: 13, color: '#2E7D32', marginBottom: 8 },
  saveButton: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 24,
    marginTop: 4,
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  divider: { height: 1, backgroundColor: '#111', marginVertical: 20 },
  securityText: { fontSize: 14, color: INK, marginBottom: 14 },
  signOutButton: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
    borderRadius: 24,
  },
  signOutButtonText: { fontSize: 15, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK },
  deleteButton: { marginTop: 18, alignSelf: 'flex-start' },
  deleteButtonText: { fontSize: 13, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: ERROR, textDecorationLine: 'underline' },
});
