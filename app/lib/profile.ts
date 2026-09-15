import { supabase } from './supabase';

export interface Profile {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  // Grrunch preferences (Anabelle, 2026-09-15) -- all optional, same as
  // fullName/phone above. None of these drive any real filtering or
  // personalization logic yet (no recipe generation or store-matching
  // reads them) -- see 20260915010000_users_grrunch_preferences.sql's
  // own comment. preferredStores/dietaryPreferences are plain string
  // arrays (multi-select), never null -- an empty array is "none
  // chosen," matching combined_exclusions/store_ids' existing text[]/
  // uuid[] convention elsewhere in this schema rather than a nullable
  // column.
  postalCode: string | null;
  householdSize: number | null;
  preferredStores: string[];
  dietaryPreferences: string[];
}

// public.users is the "profile row extending auth.users" table from
// supabase/migrations/20260725163230_init_schema.sql -- created lazily
// (upsert, not provisioned at signup) the first time the user actually
// saves something here, per that table's own documented intent. Settings
// > Manage account (Anabelle, 2026-08-28) is its first real reader/writer.
export async function fetchProfile(userId: string): Promise<{ profile: Profile | null; error: string | null }> {
  const { data, error } = await supabase
    .from('users')
    .select('first_name, last_name, phone, postal_code, household_size, preferred_stores, dietary_preferences')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    return { profile: null, error: error.message };
  }
  return {
    profile: {
      firstName: data?.first_name ?? null,
      lastName: data?.last_name ?? null,
      phone: data?.phone ?? null,
      postalCode: data?.postal_code ?? null,
      householdSize: data?.household_size ?? null,
      preferredStores: data?.preferred_stores ?? [],
      dietaryPreferences: data?.dietary_preferences ?? [],
    },
    error: null,
  };
}

export async function saveProfile(
  userId: string,
  email: string | null,
  profile: Profile
): Promise<{ error: string | null }> {
  // upsert, not update -- this row may not exist yet (see comment above).
  const { error } = await supabase.from('users').upsert({
    id: userId,
    email,
    first_name: profile.firstName,
    last_name: profile.lastName,
    phone: profile.phone,
    postal_code: profile.postalCode,
    household_size: profile.householdSize,
    preferred_stores: profile.preferredStores,
    dietary_preferences: profile.dietaryPreferences,
  });
  return { error: error?.message ?? null };
}

// Real account deletion -- routes to the delete-account Edge Function
// (service-role only operation, see its own header comment for why this
// can't be done directly from the client SDK).
export async function deleteAccount(): Promise<{ error: string | null }> {
  const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });
  if (error) {
    return { error: error.message };
  }
  if (data?.error) {
    return { error: data.error as string };
  }
  return { error: null };
}
