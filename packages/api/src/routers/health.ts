import { router, publicProcedure } from '../trpc.js';

export const healthRouter = router({
  ping: publicProcedure.query(() => ({
    status: 'ok' as const,
    service: 'sniffoutpro-api',
    timestamp: new Date().toISOString(),
  })),
});
