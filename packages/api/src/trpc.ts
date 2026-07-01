import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { ApiContext } from './context.js';

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

export const syncProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.syncAuthorized) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sync authorization required' });
  }
  return next({ ctx });
});

export const createCallerFactory = t.createCallerFactory;
