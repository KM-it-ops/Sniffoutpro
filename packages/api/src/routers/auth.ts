import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { users } from '@sniffoutpro/db/schema';
import { router, protectedProcedure } from '../trpc.js';

export const authRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.userId;
    if (userId === null) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    const rows = await ctx.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return {
      userId,
      tier: ctx.tier,
      email: rows[0]?.email ?? null,
    };
  }),
});
