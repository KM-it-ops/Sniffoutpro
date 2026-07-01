export type ResolvedAuth = {
  userId: string | null;
  syncAuthorized: boolean;
};

function readBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader === null || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

async function resolveSupabaseUserId(bearer: string): Promise<string | null> {
  const supabaseUrl = process.env['SUPABASE_URL'];
  const supabaseAnonKey = process.env['SUPABASE_ANON_KEY'];
  if (supabaseUrl === undefined || supabaseAnonKey === undefined) {
    return null;
  }

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${bearer}`,
        apikey: supabaseAnonKey,
      },
    });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as { id?: string };
    return typeof body.id === 'string' ? body.id : null;
  } catch {
    return null;
  }
}

export async function resolveRequestAuth(req: Request): Promise<ResolvedAuth> {
  const bearer = readBearerToken(req);
  let userId: string | null = null;

  if (bearer !== null) {
    userId = await resolveSupabaseUserId(bearer);
  }

  const syncToken = process.env['SNIFFOUT_SYNC_TOKEN'];
  const syncAuthorized =
    syncToken === undefined ||
    syncToken === '' ||
    userId !== null ||
    (bearer !== null && bearer === syncToken);

  return { userId, syncAuthorized };
}
