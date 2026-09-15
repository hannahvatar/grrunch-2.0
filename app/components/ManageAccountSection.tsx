import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../lib/auth';
import { deleteAccount, fetchProfile, Profile, saveProfile } from '../lib/profile';
import { supabase } from '../lib/supabase';
import { ChipMultiSelect } from './ChipMultiSelect';
import { InputField } from './InputField';
import { SignInOrTrialPrompt } from './SignInOrTrialPrompt';

const ACCENT = '#FFA955';
const INK = '#111';
const ERROR = '#D0342C';

// Same 5 chains named in lib/support.ts's own FAQ prose ("Save-On-Foods,
// Real Canadian Superstore, No Frills, Safeway, and Walmart"). Not
// imported from lib/dealZones.ts's ZONES_BY_CHAIN -- that map is real
// zone-matching data for a different concern (nearest-flyer-zone
// lookups); this is just a lightweight preference chip list that
// happens to name the same chains, sourced independently on purpose so
// the two stay decoupled.
const STORE_CHAINS = ['Save-On-Foods', 'Real Canadian Superstore', 'No Frills', 'Safeway', 'Walmart'];

// No filtering logic reads this yet (see the migration's own comment) --
// a reasonable, common starting set, not tied to any existing recipe
// tagging.
const DIETARY_OPTIONS = [
  'Vegetarian',
  'Vegan',
  'Gluten-free',
  'Dairy-free',
  'Nut-free',
  'Halal',
  'Kosher',
  'Low-carb',
];

// Manage account's expanded content, inside settings.tsx's accordion row.
// Real, wired up: personal info reads/writes public.users (see
// lib/profile.ts), security shows the real signed-in method and calls the
// real supabase.auth.signOut() / delete-account Edge Function. Deliberately
// does NOT show Password/Passkey/Authenticator app/2-step verification --
// this app's real auth is Apple/Google OAuth + email magic-link, there's no
// password anywhere in that flow, so those rows would be fabricated
// (Anabelle's call, 2026-08-28).
export function ManageAccountSection({ onSaved }: { onSaved?: () => void } = {}) {
  const { session, isGuest } = useAuth();

  if (isGuest) {
    // Manage account is gated on having an account at all, not just a
    // subscription (Grocery list's UpgradeCta is), so a guest gets both
    // real paths forward -- Anabelle's mockup, 2026-08-28.
    return (
      <View style={styles.wrap}>
        <SignInOrTrialPrompt reason="manage your account" />
      </View>
    );
  }

  return (
    <ManageAccountForm
      userId={session!.user.id}
      email={session!.user.email ?? null}
      provider={session!.user.app_metadata?.provider}
      onSaved={onSaved}
    />
  );
}

function providerLabel(provider: unknown): string {
  if (provider === 'apple') return 'Apple';
  if (provider === 'google') return 'Google';
  if (provider === 'email') return 'Email';
  return 'your account';
}

// Default/empty shape, used both as fetchProfile's fallback and as the
// initial "saved" baseline the dirty-check compares against -- one
// definition instead of repeating this object literal at both call
// sites (a mismatch between them would silently break the dirty check).
const EMPTY_PROFILE: Profile = {
  firstName: null,
  lastName: null,
  phone: null,
  postalCode: null,
  householdSize: null,
  preferredStores: [],
  dietaryPreferences: [],
};

function ManageAccountForm({
  userId,
  email,
  provider,
  onSaved,
}: {
  userId: string;
  email: string | null;
  provider: unknown;
  onSaved?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<Profile>(EMPTY_PROFILE);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  // Grrunch preferences (Anabelle, 2026-09-15). householdSize is kept as
  // a plain string while editing (same reasoning as phone -- it's a form
  // field, not a live numeric value) and parsed on save.
  const [postalCode, setPostalCode] = useState('');
  const [householdSize, setHouseholdSize] = useState('');
  const [preferredStores, setPreferredStores] = useState<string[]>([]);
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchProfile(userId).then(({ profile }) => {
      if (cancelled) return;
      setSaved(profile ?? EMPTY_PROFILE);
      setFirstName(profile?.firstName ?? '');
      setLastName(profile?.lastName ?? '');
      setPhone(profile?.phone ?? '');
      setPostalCode(profile?.postalCode ?? '');
      setHouseholdSize(profile?.householdSize != null ? String(profile.householdSize) : '');
      setPreferredStores(profile?.preferredStores ?? []);
      setDietaryPreferences(profile?.dietaryPreferences ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Array-valued fields compared by contents, not reference -- values
  // arriving from fetchProfile/saved are always fresh arrays, so a plain
  // !== would always read dirty even with nothing actually changed.
  const arraysDiffer = (a: string[], b: string[]) => a.length !== b.length || a.some((v) => !b.includes(v));
  const dirty =
    firstName !== (saved.firstName ?? '') ||
    lastName !== (saved.lastName ?? '') ||
    phone !== (saved.phone ?? '') ||
    postalCode !== (saved.postalCode ?? '') ||
    householdSize !== (saved.householdSize != null ? String(saved.householdSize) : '') ||
    arraysDiffer(preferredStores, saved.preferredStores) ||
    arraysDiffer(dietaryPreferences, saved.dietaryPreferences);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    // Anything that doesn't parse to a real positive number (blank,
    // "0", "abc") is treated the same as "not set" -- household size is
    // optional, so a bad/empty entry should just clear it, not block
    // saving the rest of the form.
    const parsedHouseholdSize = Number.parseInt(householdSize, 10);
    const nextProfile: Profile = {
      firstName: firstName.trim() || null,
      lastName: lastName.trim() || null,
      phone: phone.trim() || null,
      postalCode: postalCode.trim() || null,
      householdSize: Number.isFinite(parsedHouseholdSize) && parsedHouseholdSize > 0 ? parsedHouseholdSize : null,
      preferredStores,
      dietaryPreferences,
    };
    const { error } = await saveProfile(userId, email, nextProfile);
    setSaving(false);
    if (error) {
      setSaveError(error);
      return;
    }
    setSaved(nextProfile);
    // Confirmation toast (Anabelle, 2026-09-15: "saving the changes/
    // addition should trigger the confirmation toast component"),
    // replacing the plain inline "Saved." text this used to be --
    // rendered/owned by the screen (see app/manage-account.tsx), not
    // this form, so it can float above the whole screen regardless of
    // scroll position.
    onSaved?.();
  }

  function handleSignOut() {
    supabase.auth.signOut();
    // mode:'signin' -- someone who just signed out already has an
    // account, so /login's headline should read as "sign back in," not
    // "create a free account."
    router.replace({ pathname: '/login', params: { mode: 'signin' } });
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
            // mode:'signup' -- the account just deleted is gone, so
            // returning here is starting fresh, not signing back in.
            router.replace({ pathname: '/login', params: { mode: 'signup' } });
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
      {/* Anabelle, 2026-09-15: "This should be at the top after 'Manage
          account' / Make Grrunch yours / Tell us a little more about
          you so we can personalize your deals and recipes. / Then the
          subsequent sections should have their titles: Personal info
          and Grrunch preferences" -- a page-level intro framing BOTH
          sections below, not just the new preferences one; none of the
          fields it introduces are required, and the "Grrunch
          preferences" ones don't drive any real personalization yet
          (see the migration's own comment) -- this describes the
          intent, not something already wired up. */}
      <Text style={styles.introTitle}>Make Grrunch yours</Text>
      <Text style={styles.sectionIntro}>
        Tell us a little more about you so we can personalize your deals and recipes.
      </Text>

      <Text style={styles.subheading}>Personal info</Text>
      {/* Split into First/Last (Anabelle, 2026-09-15), was one combined
          "Name" field -- two real columns (see the migration), not a
          client-side split/join of one string. */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>First name</Text>
        <InputField placeholder="First name" value={firstName} onChangeText={setFirstName} />
      </View>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Last name</Text>
        <InputField placeholder="Last name" value={lastName} onChangeText={setLastName} />
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

      <View style={styles.divider} />

      <Text style={styles.subheading}>Grrunch preferences</Text>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Postal code</Text>
        <InputField placeholder="Postal code" value={postalCode} onChangeText={setPostalCode} />
      </View>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Household size</Text>
        <InputField
          placeholder="Household size"
          keyboardType="number-pad"
          value={householdSize}
          onChangeText={setHouseholdSize}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Preferred stores</Text>
        <ChipMultiSelect options={STORE_CHAINS} values={preferredStores} onChange={setPreferredStores} />
      </View>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Dietary preferences</Text>
        <ChipMultiSelect options={DIETARY_OPTIONS} values={dietaryPreferences} onChange={setDietaryPreferences} />
      </View>

      {saveError && <Text style={styles.errorText}>{saveError}</Text>}
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
  // Page-level intro (Anabelle, 2026-09-15), sits above both "Personal
  // info" and "Grrunch preferences" -- a size step up from subheading
  // below (ExtraBold, not Bold) since it's this whole form's own
  // welcoming headline, not a section label like those two.
  introTitle: { fontSize: 16, fontWeight: '800', fontFamily: 'OpenSans_800ExtraBold', color: INK, marginBottom: 4 },
  subheading: { fontSize: 14, fontWeight: '700', fontFamily: 'OpenSans_700Bold', color: INK, marginBottom: 10 },
  // Sits right under introTitle, before "Personal info" -- negative
  // marginTop pulls it in close under that title instead of the full
  // gap:12 the wrap container's own spacing would otherwise add. 16px/
  // INK (Anabelle, 2026-09-15) -- was 13px/#666, same muted secondary
  // treatment as most other body copy on this screen, but the ask was
  // for this specific line to read at full text weight/size instead.
  sectionIntro: { fontSize: 16, color: INK, marginTop: -8, marginBottom: 4 },
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
