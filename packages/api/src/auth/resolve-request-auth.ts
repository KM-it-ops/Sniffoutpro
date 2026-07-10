import { timingSafeEqual } from 'node:crypto';

export type ResolvedAuth = {
  userId: string | null;
  syncAuthorized: boolean;
};

function isProductionRuntime(): boolean {
  return process.env['VERCEL'] === '1' || process.env['NODE_ENV'] === 'production';
}

function readBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader === null || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function tokensEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
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
  const tokenConfigured = syncToken !== undefined && syncToken !== '';
  const bearerMatchesToken = bearer !== null && tokenConfigured && tokensEqual(bearer, syncToken);

  // Production must fail closed: missing/empty sync token is NOT open access.
  if (isProductionRuntime() && !tokenConfigured && userId === null) {
    console.error(
      '[auth] SNIFFOUT_SYNC_TOKEN is unset/empty in production — syncAuthorized=false (fail-closed)',
    );
    return { userId, syncAuthorized: false };
  }

  const syncAuthorized =
    userId !== null || bearerMatchesToken || (!isProductionRuntime() && !tokenConfigured);

  return { userId, syncAuthorized };
}
