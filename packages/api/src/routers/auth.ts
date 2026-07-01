import { router, protectedProcedure } from '../trpc.js';

export const authRouter = router({
  me: protectedProcedure.query(({ ctx }) => ({
    userId: ctx.userId,
    tier: ctx.tier,
  })),
});
