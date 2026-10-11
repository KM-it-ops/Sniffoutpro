import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { withMemberRole } from '@sniffoutpro/db';
import { hasTierFeature } from '@sniffoutpro/types';
import type { ApiContext } from './context.js';

type TierFeature = Parameters<typeof hasTierFeature>[1];

const t = initTRPC.context<ApiContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const signedInProcedure = t.procedure.use(({ ctx, next }) => {
  if (ctx.userId === null) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

// Last step before the resolver, after every check that needs no database: the resolver's queries run as
// the restricted role for this user, so the database itself refuses other people's rows (review cf90d58-F1).
const asMember = t.middleware(({ ctx, next }) => {
  const userId = ctx.userId;
  if (userId === null) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  return withMemberRole(ctx.db, userId, async (db) => {
    const result = await next({ ctx: { ...ctx, db } });
    // next() reports a failed procedure instead of throwing; throw it so the transaction rolls back.
    if (!result.ok) {
      throw result.error;
    }
    return result;
  });
});

function tierGate(feature: TierFeature) {
  return t.middleware(({ ctx, next }) => {
    if (!hasTierFeature(ctx.tier, feature)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'This feature is not included in your tier',
      });
    }
    return next({ ctx });
  });
}

export const protectedProcedure = signedInProcedure.use(asMember);

export function requireTierFeature(feature: TierFeature) {
  return signedInProcedure.use(tierGate(feature)).use(asMember);
}

// Upload gate: a signed-in user on a tier with cloud sync, holding sync authorization.
export const syncProcedure = signedInProcedure
  .use(tierGate('cloudSync'))
  .use(({ ctx, next }) => {
    if (!ctx.syncAuthorized) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sync authorization required' });
    }
    return next({ ctx });
  })
  .use(asMember);

export const createCallerFactory = t.createCallerFactory;
