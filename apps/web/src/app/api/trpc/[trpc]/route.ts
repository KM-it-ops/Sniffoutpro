import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter, createContext, createLogger, resolveRequestAuth } from '@sniffoutpro/api';
import type { Tier } from '@sniffoutpro/types';
import { getDb } from '@/lib/db';

const logger = createLogger('web-trpc');

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
};

function resolveTier(): Tier {
  const tier = process.env['SNIFFOUT_TIER'];
  if (tier === 'WORKSTATION' || tier === 'CONSULTANT' || tier === 'ADMIN') {
    return tier;
  }
  return 'WORKSTATION';
}

async function handler(req: Request) {
  const auth = await resolveRequestAuth(req);
  const response = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () =>
      createContext({
        db: getDb(),
        logger,
        userId: auth.userId,
        tier: resolveTier(),
        syncAuthorized: auth.syncAuthorized,
      }),
  });

  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export { handler as GET, handler as POST };
