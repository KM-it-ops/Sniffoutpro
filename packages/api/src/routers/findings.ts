import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { findings } from '@sniffoutpro/db/schema';
import { assertScanInCallerOrg } from '../org/scan-guard.js';
import { assertRateLimit } from '../rate-limit.js';
import { router, protectedProcedure } from '../trpc.js';

export const findingsRouter = router({
  list: protectedProcedure
    .input(z.object({ scanRunId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      assertRateLimit(ctx.userId ?? 'anon', {
        prefix: 'findings.list',
        limit: 60,
        windowMs: 60_000,
      });
      if (ctx.userId === null) {
        return [];
      }
      const seen = await assertScanInCallerOrg(ctx.db, ctx.userId, input.scanRunId);
      if (seen === 'missing') {
        return [];
      }
      return ctx.db.select().from(findings).where(eq(findings.scanRunId, input.scanRunId));
    }),
});
