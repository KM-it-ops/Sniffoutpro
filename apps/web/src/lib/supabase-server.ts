import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { cookies } from 'next/headers';

function supabaseEnv(): { url: string; key: string } | null {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? process.env['SUPABASE_URL'];
  const key = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? process.env['SUPABASE_ANON_KEY'];
  if (url === undefined || url === '' || key === undefined || key === '') {
    return null;
  }
  return { url, key };
}

export async function createSupabaseServer() {
  const env = supabaseEnv();
  if (env === null) {
    return null;
  }

  const cookieStore = await cookies();
  // The deprecated overload is get/set/remove. This call uses getAll/setAll.
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- supported cookie methods
  return createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // A Server Component cannot set cookies. The action or middleware can.
        }
      },
    },
  });
}

export async function readSessionAccessToken(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServer();
    if (supabase === null) {
      return null;
    }
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}
