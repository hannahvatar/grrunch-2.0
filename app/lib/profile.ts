import { supabase } from './supabase';

export interface Profile {
  fullName: string | null;
  phone: string | null;
}

// public.users is the "profile row extending auth.users" table from
// supabase/migrations/20260725163230_init_schema.sql -- created lazily
// (upsert, not provisioned at signup) the first time the user actually
// saves something here, per that table's own documented intent. Settings
// > Manage account (Anabelle, 2026-08-28) is its first real reader/writer.
export async function fetchProfile(userId: string): Promise<{ profile: Profile | null; error: string | null }> {
  const { data, error } = await supabase
    .from('users')
    .select('full_name, phone')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    return { profile: null, error: error.message };
  }
  return { profile: { fullName: data?.full_name ?? null, phone: data?.phone ?? null }, error: null };
}

export async function saveProfile(
  userId: string,
  email: string | null,
  profile: Profile
): Promise<{ error: string | null }> {
  // upsert, not update -- this row may not exist yet (see comment above).
  const { error } = await supabase
    .from('users')
    .upsert({ id: userId, email, full_name: profile.fullName, phone: profile.phone });
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
