import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { hosts } from '@sniffoutpro/db/schema';
import { assertScanInCallerOrg } from '../org/scan-guard.js';
import { assertRateLimit } from '../rate-limit.js';
import { router, protectedProcedure } from '../trpc.js';

export const hostsRouter = router({
  list: protectedProcedure
    .input(z.object({ scanRunId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      assertRateLimit(ctx.userId ?? 'anon', {
        prefix: 'hosts.list',
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
      return ctx.db.select().from(hosts).where(eq(hosts.scanRunId, input.scanRunId));
    }),
});
