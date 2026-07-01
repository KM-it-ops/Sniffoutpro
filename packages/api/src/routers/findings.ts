import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { findings } from '@sniffoutpro/db/schema';
import { router, publicProcedure } from '../trpc.js';

export const findingsRouter = router({
  list: publicProcedure
    .input(z.object({ scanRunId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(findings)
        .where(eq(findings.scanRunId, input.scanRunId));
    }),
});
