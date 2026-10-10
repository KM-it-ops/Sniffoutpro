import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Queryable } from '@sniffoutpro/db';
import { memberships, scanJobs } from '@sniffoutpro/db/schema';
import { canSchedule, parseOrgRole } from '../org/access.js';
import { requireTierFeature, router } from '../trpc.js';

const IntensitySchema = z.enum(['light', 'standard', 'deep']);
const MinuteIntervalSchema = z
  .string()
  .regex(/^[1-9]\d*$/, 'Enter a whole number of minutes, at least 1.');

export function jobsForUser<T extends { userId: string | null }>(rows: T[], userId: string): T[] {
  return rows.filter((row) => row.userId === userId);
}

function requireUserId(userId: string | null): string {
  if (userId === null) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  return userId;
}

async function callerScheduleOrg(db: Queryable, userId: string): Promise<{ orgId: string }> {
  const [membership] = await db
    .select({ orgId: memberships.orgId, role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active')))
    .limit(1);
  const role = parseOrgRole(membership?.role);
  if (membership === undefined || role === null || !canSchedule(role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Your role cannot save a schedule' });
  }
  return { orgId: membership.orgId };
}

function ownedSchedule<T extends { id: string; userId: string | null; orgId: string | null }>(
  rows: T[],
  userId: string,
  jobId: string,
  orgId: string,
): T {
  const owned = jobsForUser(rows, userId).find((row) => row.id === jobId);
  if (owned === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Schedule not found' });
  }
  if (owned.orgId !== null && owned.orgId !== orgId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'That schedule belongs to another organization',
    });
  }
  return owned;
}

export const scanJobsRouter = router({
  create: requireTierFeature('schedules')
    .input(
      z.object({
        cron: MinuteIntervalSchema,
        targets: z.array(z.string().min(1)).min(1),
        intensity: IntensitySchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx.userId);
      const { orgId } = await callerScheduleOrg(ctx.db, userId);
      const [row] = await ctx.db
        .insert(scanJobs)
        .values({
          userId,
          orgId,
          cron: input.cron,
          targets: input.targets,
          intensity: input.intensity,
          enabled: true,
          nextRunAt: new Date(),
        })
        .returning();
      return row;
    }),

  list: requireTierFeature('schedules').query(async ({ ctx }) => {
    const userId = requireUserId(ctx.userId);
    const rows = await ctx.db.select().from(scanJobs).where(eq(scanJobs.userId, userId));
    return jobsForUser(rows, userId);
  }),

  update: requireTierFeature('schedules')
    .input(
      z.object({
        id: z.string().uuid(),
        cron: MinuteIntervalSchema,
        targets: z.array(z.string().min(1)).min(1),
        intensity: IntensitySchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx.userId);
      const { orgId } = await callerScheduleOrg(ctx.db, userId);
      const rows = await ctx.db.select().from(scanJobs).where(eq(scanJobs.id, input.id));
      ownedSchedule(rows, userId, input.id, orgId);
      const minutes = Number(input.cron);
      const nextRunAt = new Date(Date.now() + minutes * 60_000);
      await ctx.db
        .update(scanJobs)
        .set({
          cron: input.cron,
          targets: input.targets,
          intensity: input.intensity,
          nextRunAt,
        })
        .where(eq(scanJobs.id, input.id));
      return {
        id: input.id,
        cron: input.cron,
        targets: input.targets,
        intensity: input.intensity,
        nextRunAt: nextRunAt.toISOString(),
      };
    }),

  recordRun: requireTierFeature('schedules')
    .input(z.object({ id: z.string().uuid(), nextRunAt: z.string().datetime() }))
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx.userId);
      const { orgId } = await callerScheduleOrg(ctx.db, userId);
      const rows = await ctx.db.select().from(scanJobs).where(eq(scanJobs.id, input.id));
      ownedSchedule(rows, userId, input.id, orgId);
      const nextRunAt = new Date(input.nextRunAt);
      await ctx.db.update(scanJobs).set({ nextRunAt }).where(eq(scanJobs.id, input.id));
      return { id: input.id, nextRunAt: nextRunAt.toISOString() };
    }),

  setEnabled: requireTierFeature('schedules')
    .input(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx.userId);
      const { orgId } = await callerScheduleOrg(ctx.db, userId);
      const rows = await ctx.db.select().from(scanJobs).where(eq(scanJobs.id, input.id));
      ownedSchedule(rows, userId, input.id, orgId);
      await ctx.db
        .update(scanJobs)
        .set({ enabled: input.enabled })
        .where(eq(scanJobs.id, input.id));
      return { id: input.id, enabled: input.enabled };
    }),
});
