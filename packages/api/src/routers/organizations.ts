import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { memberships, organizations, users } from '@sniffoutpro/db/schema';
import { canInvite, parseOrgRole, removesOnlyAdmin } from '../org/access.js';
import { protectedProcedure, router } from '../trpc.js';

function requireUserId(userId: string | null): string {
  if (userId === null) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  return userId;
}

export const organizationsRouter = router({
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1), slug: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx.userId);
      const name = input.name.trim();
      const slug = input.slug.trim();
      if (name === '' || slug === '') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Enter an organization name and a short name.',
        });
      }
      const [taken] = await ctx.db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, slug))
        .limit(1);
      if (taken !== undefined) {
        throw new TRPCError({ code: 'CONFLICT', message: 'That short name is already used.' });
      }
      const [org] = await ctx.db.insert(organizations).values({ name, slug }).returning();
      if (org === undefined) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Organization was not created',
        });
      }
      await ctx.db.insert(memberships).values({
        orgId: org.id,
        userId,
        role: 'admin',
      });
      return org;
    }),

  invite: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        email: z.string().email(),
        role: z.enum(['admin', 'analyst', 'viewer']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx.userId);
      const [caller] = await ctx.db
        .select({ role: memberships.role })
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, userId),
            eq(memberships.orgId, input.orgId),
            eq(memberships.status, 'active'),
          ),
        )
        .limit(1);
      const role = parseOrgRole(caller?.role);
      if (role === null || !canInvite(role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only an admin can invite' });
      }
      const [invitee] = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);
      if (invitee === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No account with that email' });
      }
      const [existing] = await ctx.db
        .select({ id: memberships.id, role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.orgId, input.orgId), eq(memberships.userId, invitee.id)))
        .limit(1);
      if (existing !== undefined) {
        if (existing.role === 'admin' && input.role !== 'admin') {
          const adminRows = await ctx.db
            .select({ userId: memberships.userId })
            .from(memberships)
            .where(
              and(
                eq(memberships.orgId, input.orgId),
                eq(memberships.role, 'admin'),
                eq(memberships.status, 'active'),
              ),
            )
            .limit(2);
          if (
            removesOnlyAdmin({
              existingRole: existing.role,
              nextRole: input.role,
              adminUserIds: adminRows.map((row) => row.userId),
              memberUserId: invitee.id,
            })
          ) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Add another admin before changing the only admin.',
            });
          }
        }
        await ctx.db
          .update(memberships)
          .set({ role: input.role })
          .where(eq(memberships.id, existing.id));
        return { orgId: input.orgId, userId: invitee.id, role: input.role, updated: true as const };
      }
      await ctx.db.insert(memberships).values({
        orgId: input.orgId,
        userId: invitee.id,
        role: input.role,
        // Grants nothing until the invited person accepts it.
        status: 'pending',
      });
      return { orgId: input.orgId, userId: invitee.id, role: input.role, updated: false as const };
    }),

  setRole: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        userId: z.string().uuid(),
        role: z.enum(['admin', 'analyst', 'viewer']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const callerId = requireUserId(ctx.userId);
      const [caller] = await ctx.db
        .select({ role: memberships.role })
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, callerId),
            eq(memberships.orgId, input.orgId),
            eq(memberships.status, 'active'),
          ),
        )
        .limit(1);
      const role = parseOrgRole(caller?.role);
      if (role === null || !canInvite(role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only an admin can change roles' });
      }
      const [target] = await ctx.db
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.orgId, input.orgId), eq(memberships.userId, input.userId)))
        .limit(1);
      if (target === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That member was not found' });
      }
      if (target.role === 'admin' && input.role !== 'admin') {
        const adminRows = await ctx.db
          .select({ userId: memberships.userId })
          .from(memberships)
          .where(
            and(
              eq(memberships.orgId, input.orgId),
              eq(memberships.role, 'admin'),
              eq(memberships.status, 'active'),
            ),
          )
          .limit(2);
        if (
          removesOnlyAdmin({
            existingRole: target.role,
            nextRole: input.role,
            adminUserIds: adminRows.map((row) => row.userId),
            memberUserId: input.userId,
          })
        ) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Add another admin before changing the only admin.',
          });
        }
      }
      await ctx.db
        .update(memberships)
        .set({ role: input.role })
        .where(and(eq(memberships.orgId, input.orgId), eq(memberships.userId, input.userId)));
      return { orgId: input.orgId, userId: input.userId, role: input.role };
    }),

  myInvites: protectedProcedure.query(async ({ ctx }) => {
    const userId = requireUserId(ctx.userId);
    return ctx.db
      .select({ orgId: memberships.orgId, orgName: organizations.name, role: memberships.role })
      .from(memberships)
      .innerJoin(organizations, eq(memberships.orgId, organizations.id))
      .where(and(eq(memberships.userId, userId), eq(memberships.status, 'pending')));
  }),

  acceptInvite: protectedProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx.userId);
      const [row] = await ctx.db
        .update(memberships)
        .set({ status: 'active' })
        .where(
          and(
            eq(memberships.userId, userId),
            eq(memberships.orgId, input.orgId),
            eq(memberships.status, 'pending'),
          ),
        )
        .returning({ role: memberships.role });
      if (row === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No invite from that organization' });
      }
      return { orgId: input.orgId, role: row.role };
    }),
});
