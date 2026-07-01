import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { hosts } from '@sniffoutpro/db/schema';
import { router, publicProcedure } from '../trpc.js';

export const hostsRouter = router({
  list: publicProcedure
    .input(z.object({ scanRunId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(hosts).where(eq(hosts.scanRunId, input.scanRunId));
    }),
});
