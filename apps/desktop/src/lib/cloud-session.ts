import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

function cloudClient(): SupabaseClient | null {
  const url: unknown = import.meta.env['VITE_SUPABASE_URL'];
  const key: unknown = import.meta.env['VITE_SUPABASE_ANON_KEY'];
  if (typeof url !== 'string' || url.length === 0 || typeof key !== 'string' || key.length === 0) {
    return null;
  }
  client ??= createClient(url, key);
  return client;
}

export function cloudSignInConfigured(): boolean {
  return cloudClient() !== null;
}

export async function signInToCloud(email: string, password: string): Promise<string | null> {
  const supabase = cloudClient();
  if (supabase === null) {
    return 'Cloud sign-in is not configured on this computer.';
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error?.message ?? null;
}

export async function getCloudAccessToken(): Promise<string | null> {
  const supabase = cloudClient();
  if (supabase === null) {
    return null;
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
