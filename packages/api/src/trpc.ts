import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { hasTierFeature } from '@sniffoutpro/types';
import type { ApiContext } from './context.js';

type TierFeature = Parameters<typeof hasTierFeature>[1];

const t = initTRPC.context<ApiContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (ctx.userId === null) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  return next({ ctx });
});

export function requireTierFeature(feature: TierFeature) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!hasTierFeature(ctx.tier, feature)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'This feature is not included in your tier',
      });
    }
    return next({ ctx });
  });
}

export const syncProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.syncAuthorized) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sync authorization required' });
  }
  return next({ ctx });
});

export const createCallerFactory = t.createCallerFactory;
