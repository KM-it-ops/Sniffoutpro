'use server';

import { ensureAuthUser } from '@sniffoutpro/api';
import { getDb } from '@/lib/db';
import { createSupabaseServer } from '@/lib/supabase-server';

export async function ensureSignedInUser(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServer();
  if (supabase === null) {
    return { ok: false, error: 'Sign-in is not configured.' };
  }

  const { data, error } = await supabase.auth.getUser();
  const user = data.user;
  if (error != null || user == null || user.email == null || user.email === '') {
    return { ok: false, error: error?.message ?? 'No signed-in user.' };
  }

  await ensureAuthUser(getDb(), { id: user.id, email: user.email });
  return { ok: true };
}
