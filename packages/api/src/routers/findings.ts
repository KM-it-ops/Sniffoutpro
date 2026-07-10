import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { findings } from '@sniffoutpro/db/schema';
import { assertRateLimit } from '../rate-limit.js';
import { router, publicProcedure } from '../trpc.js';

export const findingsRouter = router({
  list: publicProcedure
    .input(z.object({ scanRunId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Spec marks findings as protected; until Phase 4 JWT auth, rate-limit public reads.
      assertRateLimit(ctx.userId ?? 'anon', {
        prefix: 'findings.list',
        limit: 60,
        windowMs: 60_000,
      });
      return ctx.db.select().from(findings).where(eq(findings.scanRunId, input.scanRunId));
    }),
});
