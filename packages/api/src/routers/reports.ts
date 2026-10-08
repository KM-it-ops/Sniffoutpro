import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '@sniffoutpro/db';
import {
  clientProfiles,
  findings,
  memberships,
  reportTemplates,
  scanRuns,
} from '@sniffoutpro/db/schema';
import { canReport, parseOrgRole } from '../org/access.js';
import { buildScanReportPdf, reportAccess, templateBelongsToOrg } from '../reports/report-pdf.js';
import { loadStoredReportLogo, storeReportLogo } from '../reports/store-report-logo.js';
import { requireTierFeature, router } from '../trpc.js';

export function rowsInOrg<T extends { orgId: string }>(rows: readonly T[], orgId: string): T[] {
  return rows.filter((row) => row.orgId === orgId);
}

async function callerReportOrg(db: Database, userId: string): Promise<{ orgId: string }> {
  const [membership] = await db
    .select({ orgId: memberships.orgId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .limit(1);
  const role = parseOrgRole(membership?.role);
  if (membership === undefined || role === null || !canReport(role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Your role cannot manage reports' });
  }
  return { orgId: membership.orgId };
}

function requireUserId(userId: string | null): string {
  if (userId === null) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  return userId;
}

function refuse(reason: ReturnType<typeof reportAccess>): void {
  switch (reason) {
    case 'ok':
      return;
    case 'no-org':
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Join an organization before downloading a report',
      });
    case 'other-scan':
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'That scan belongs to another organization',
      });
    case 'other-client':
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'That client belongs to another organization',
      });
    default: {
      const unreachable: never = reason;
      throw new TRPCError({ code: 'FORBIDDEN', message: unreachable });
    }
  }
}

export const reportsRouter = router({
  download: requireTierFeature('reports')
    .input(
      z.object({
        scanId: z.string().uuid(),
        clientId: z.string().uuid(),
        logoPngBase64: z.string().optional(),
        templateId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx.userId);
      const membershipRows = await ctx.db
        .select({ orgId: memberships.orgId, role: memberships.role })
        .from(memberships)
        .where(eq(memberships.userId, userId))
        .limit(1);
      const role = parseOrgRole(membershipRows[0]?.role);
      if (role === null || !canReport(role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Your role cannot download reports' });
      }
      const scanRows = await ctx.db
        .select({ orgId: scanRuns.orgId })
        .from(scanRuns)
        .where(eq(scanRuns.id, input.scanId))
        .limit(1);
      const clientRows = await ctx.db
        .select({
          orgId: clientProfiles.orgId,
          name: clientProfiles.name,
          logoUrl: clientProfiles.logoUrl,
        })
        .from(clientProfiles)
        .where(eq(clientProfiles.id, input.clientId))
        .limit(1);

      const access = reportAccess({
        callerOrgId: membershipRows[0]?.orgId ?? null,
        scanOrgId: scanRows[0]?.orgId ?? null,
        clientOrgId: clientRows[0]?.orgId ?? null,
      });
      refuse(access);

      const clientName = clientRows[0]?.name;
      if (clientName === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found' });
      }

      let logoPng: Uint8Array | undefined =
        input.logoPngBase64 === undefined ? undefined : Buffer.from(input.logoPngBase64, 'base64');
      if (logoPng !== undefined) {
        const stored = await storeReportLogo(logoPng, input.clientId);
        if (stored !== null) {
          await ctx.db
            .update(clientProfiles)
            .set({ logoUrl: stored })
            .where(eq(clientProfiles.id, input.clientId));
        }
      } else {
        const storedUrl = clientRows[0]?.logoUrl;
        if (typeof storedUrl === 'string' && storedUrl !== '') {
          logoPng = await loadStoredReportLogo(storedUrl);
        }
      }

      let templateName: string | undefined;
      if (input.templateId !== undefined) {
        const [template] = await ctx.db
          .select({ orgId: reportTemplates.orgId, name: reportTemplates.name })
          .from(reportTemplates)
          .where(eq(reportTemplates.id, input.templateId))
          .limit(1);
        if (template === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Template not found' });
        }
        if (!templateBelongsToOrg(membershipRows[0]?.orgId ?? null, template.orgId)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'That template belongs to another organization',
          });
        }
        templateName = template.name;
      }

      const findingRows = await ctx.db
        .select({ title: findings.title, severity: findings.severity })
        .from(findings)
        .where(eq(findings.scanRunId, input.scanId));

      const pdf = await buildScanReportPdf({
        clientName,
        scanId: input.scanId,
        findings: findingRows,
        ...(logoPng === undefined ? {} : { logoPng }),
        ...(templateName === undefined ? {} : { templateName }),
      });
      return { pdfBase64: Buffer.from(pdf).toString('base64') };
    }),

  clients: router({
    create: requireTierFeature('reports')
      .input(z.object({ name: z.string().min(1), notes: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const userId = requireUserId(ctx.userId);
        const { orgId } = await callerReportOrg(ctx.db, userId);
        const [row] = await ctx.db
          .insert(clientProfiles)
          .values({
            orgId,
            name: input.name,
            ...(input.notes === undefined ? {} : { notes: input.notes }),
          })
          .returning();
        if (row === undefined) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Client was not saved' });
        }
        return row;
      }),

    list: requireTierFeature('reports').query(async ({ ctx }) => {
      const userId = requireUserId(ctx.userId);
      const { orgId } = await callerReportOrg(ctx.db, userId);
      const rows = await ctx.db
        .select()
        .from(clientProfiles)
        .where(eq(clientProfiles.orgId, orgId));
      return rowsInOrg(rows, orgId);
    }),

    update: requireTierFeature('reports')
      .input(
        z.object({
          id: z.string().uuid(),
          name: z.string().min(1),
          notes: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const userId = requireUserId(ctx.userId);
        const { orgId } = await callerReportOrg(ctx.db, userId);
        const [existing] = await ctx.db
          .select({ id: clientProfiles.id, orgId: clientProfiles.orgId })
          .from(clientProfiles)
          .where(eq(clientProfiles.id, input.id))
          .limit(1);
        if (existing === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found' });
        }
        if (existing.orgId !== orgId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'That client belongs to another organization',
          });
        }
        await ctx.db
          .update(clientProfiles)
          .set({
            name: input.name,
            ...(input.notes === undefined ? {} : { notes: input.notes }),
          })
          .where(eq(clientProfiles.id, input.id));
        return { id: input.id, name: input.name };
      }),
  }),

  templates: router({
    create: requireTierFeature('reports')
      .input(
        z.object({
          name: z.string().min(1),
          branding: z.record(z.string(), z.string()).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const userId = requireUserId(ctx.userId);
        const { orgId } = await callerReportOrg(ctx.db, userId);
        const [row] = await ctx.db
          .insert(reportTemplates)
          .values({
            orgId,
            name: input.name,
            ...(input.branding === undefined ? {} : { branding: input.branding }),
          })
          .returning();
        if (row === undefined) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Template was not saved' });
        }
        return row;
      }),

    list: requireTierFeature('reports').query(async ({ ctx }) => {
      const userId = requireUserId(ctx.userId);
      const { orgId } = await callerReportOrg(ctx.db, userId);
      const rows = await ctx.db
        .select()
        .from(reportTemplates)
        .where(eq(reportTemplates.orgId, orgId));
      return rowsInOrg(rows, orgId);
    }),

    update: requireTierFeature('reports')
      .input(
        z.object({
          id: z.string().uuid(),
          name: z.string().min(1),
          branding: z.record(z.string(), z.string()).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const userId = requireUserId(ctx.userId);
        const { orgId } = await callerReportOrg(ctx.db, userId);
        const [existing] = await ctx.db
          .select({ id: reportTemplates.id, orgId: reportTemplates.orgId })
          .from(reportTemplates)
          .where(eq(reportTemplates.id, input.id))
          .limit(1);
        if (existing === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Template not found' });
        }
        if (existing.orgId !== orgId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'That template belongs to another organization',
          });
        }
        await ctx.db
          .update(reportTemplates)
          .set({
            name: input.name,
            ...(input.branding === undefined ? {} : { branding: input.branding }),
          })
          .where(eq(reportTemplates.id, input.id));
        return { id: input.id, name: input.name };
      }),
  }),
});
