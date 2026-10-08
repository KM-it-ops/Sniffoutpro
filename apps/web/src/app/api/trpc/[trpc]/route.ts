import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import {
  appRouter,
  createContext,
  createLogger,
  resolveRequestAuth,
  resolveUserTier,
} from '@sniffoutpro/api';
import { getDb } from '@/lib/db';
import { publicTrpcCorsHeaders } from '@/lib/public-cors';
import { readSessionAccessToken } from '@/lib/supabase-server';

const logger = createLogger('web-trpc');

async function withSessionBearer(req: Request): Promise<Request> {
  if (req.headers.get('authorization') !== null) {
    return req;
  }
  const token = await readSessionAccessToken();
  if (token === null) {
    return req;
  }
  const headers = new Headers(req.headers);
  headers.set('authorization', `Bearer ${token}`);
  return new Request(req, { headers });
}

async function handler(req: Request) {
  const auth = await resolveRequestAuth(await withSessionBearer(req));
  const db = getDb();
  const tier = await resolveUserTier(db, auth.userId);
  const response = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () =>
      createContext({
        db,
        logger,
        userId: auth.userId,
        tier,
        syncAuthorized: auth.syncAuthorized,
      }),
  });

  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(publicTrpcCorsHeaders)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: publicTrpcCorsHeaders });
}

export { handler as GET, handler as POST };
