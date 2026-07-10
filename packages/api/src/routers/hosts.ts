import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { hosts } from '@sniffoutpro/db/schema';
import { assertRateLimit } from '../rate-limit.js';
import { router, publicProcedure } from '../trpc.js';

export const hostsRouter = router({
  list: publicProcedure
    .input(z.object({ scanRunId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Spec marks hosts as protected; until Phase 4 JWT auth, rate-limit public reads.
      // Regression: lockdown test asserts UNAUTHORIZED once auth is wired (see hosts-lockdown.test.ts).
      assertRateLimit(ctx.userId ?? 'anon', {
        prefix: 'hosts.list',
        limit: 60,
        windowMs: 60_000,
      });
      return ctx.db.select().from(hosts).where(eq(hosts.scanRunId, input.scanRunId));
    }),
});
