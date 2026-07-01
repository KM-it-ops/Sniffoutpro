import { desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '@sniffoutpro/db';
import {
  authorizationScopes,
  cveCache,
  findings,
  hosts,
  scanRuns,
  services,
} from '@sniffoutpro/db/schema';
import { diffScanRuns } from '@sniffoutpro/scan-engine';
import { FindingSchema, HostSchema, ScanRunSchema, type ScanRun } from '@sniffoutpro/types';
import { router, publicProcedure, syncProcedure } from '../trpc.js';

const SyncScanInputSchema = z.object({
  consentText: z.string().min(1),
  scanRun: ScanRunSchema,
  rawOutput: z.string().optional(),
});

async function loadScanDetail(db: Database, id: string): Promise<{ scan: ScanRun } | null> {
  const [run] = await db.select().from(scanRuns).where(eq(scanRuns.id, id)).limit(1);
  if (run === undefined) {
    return null;
  }

  const hostRows = await db.select().from(hosts).where(eq(hosts.scanRunId, id));
  const hostIds = hostRows.map((h) => h.id);
  const serviceRows =
    hostIds.length > 0
      ? await db.select().from(services).where(inArray(services.hostId, hostIds))
      : [];

  const servicesByHost = new Map<string, typeof serviceRows>();
  for (const svc of serviceRows) {
    const list = servicesByHost.get(svc.hostId) ?? [];
    list.push(svc);
    servicesByHost.set(svc.hostId, list);
  }

  const mappedHosts = hostRows.map((host) =>
    HostSchema.parse({
      ip: host.ip,
      hostname: host.hostname ?? undefined,
      mac: host.mac ?? undefined,
      os: host.os ?? undefined,
      osConfidence: host.osConfidence ?? undefined,
      services: (servicesByHost.get(host.id) ?? []).map((svc) => ({
        port: svc.port,
        protocol: svc.protocol,
        product: svc.product ?? undefined,
        version: svc.version ?? undefined,
        banner: svc.banner ?? undefined,
      })),
    }),
  );

  const hostIpById = new Map(hostRows.map((h) => [h.id, h.ip]));
  const findingRows = await db.select().from(findings).where(eq(findings.scanRunId, id));

  const mappedFindings = findingRows.map((f) =>
    FindingSchema.parse({
      id: f.id,
      cveId: f.cveId ?? undefined,
      title: f.title,
      severity: f.severity,
      cvssScore: f.cvssScore ?? undefined,
      riskScore: f.riskScore,
      hostIp: f.hostId !== null ? (hostIpById.get(f.hostId) ?? 'unknown') : 'unknown',
      port: undefined,
      description: f.description ?? undefined,
    }),
  );

  return {
    scan: ScanRunSchema.parse({
      id: run.id,
      status: run.status,
      targets: run.targets,
      intensity: run.intensity,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString(),
      hosts: mappedHosts,
      findings: mappedFindings,
    }),
  };
}

export const scansRouter = router({
  list: publicProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      ctx.logger.debug({ limit }, 'scans.list');
      return ctx.db
        .select({
          id: scanRuns.id,
          status: scanRuns.status,
          targets: scanRuns.targets,
          intensity: scanRuns.intensity,
          startedAt: scanRuns.startedAt,
          completedAt: scanRuns.completedAt,
        })
        .from(scanRuns)
        .orderBy(desc(scanRuns.startedAt))
        .limit(limit);
    }),

  getDetail: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => loadScanDetail(ctx.db, input.id)),

  sync: syncProcedure.input(SyncScanInputSchema).mutation(async ({ ctx, input }) => {
    const { scanRun, consentText, rawOutput } = input;
    ctx.logger.info({ scanId: scanRun.id, targets: scanRun.targets }, 'scans.sync');

    await ctx.db.transaction(async (tx) => {
      const scopeId = crypto.randomUUID();
      await tx.insert(authorizationScopes).values({
        id: scopeId,
        userId: ctx.userId,
        targets: scanRun.targets,
        consentText,
        consentedAt: new Date(scanRun.startedAt),
      });

      await tx.insert(scanRuns).values({
        id: scanRun.id,
        authorizationScopeId: scopeId,
        status: scanRun.status,
        targets: scanRun.targets,
        intensity: scanRun.intensity,
        startedAt: new Date(scanRun.startedAt),
        completedAt: scanRun.completedAt !== undefined ? new Date(scanRun.completedAt) : null,
        rawOutput: rawOutput ?? null,
        normalizedOutput: { hosts: scanRun.hosts, findings: scanRun.findings },
      });

      const hostIdByIp = new Map<string, string>();

      for (const host of scanRun.hosts) {
        const hostId = crypto.randomUUID();
        hostIdByIp.set(host.ip, hostId);
        await tx.insert(hosts).values({
          id: hostId,
          scanRunId: scanRun.id,
          ip: host.ip,
          hostname: host.hostname ?? null,
          mac: host.mac ?? null,
          os: host.os ?? null,
          osConfidence: host.osConfidence ?? null,
        });

        for (const svc of host.services) {
          await tx.insert(services).values({
            id: crypto.randomUUID(),
            hostId,
            port: svc.port,
            protocol: svc.protocol,
            product: svc.product ?? null,
            version: svc.version ?? null,
            banner: svc.banner ?? null,
          });
        }
      }

      for (const finding of scanRun.findings) {
        if (finding.cveId !== undefined) {
          await tx
            .insert(cveCache)
            .values({
              id: finding.cveId,
              description: finding.description ?? null,
              cvssScore: finding.cvssScore ?? null,
              lastSyncedAt: new Date(),
            })
            .onConflictDoNothing();
        }
      }

      for (const finding of scanRun.findings) {
        await tx.insert(findings).values({
          id: finding.id,
          scanRunId: scanRun.id,
          hostId: hostIdByIp.get(finding.hostIp) ?? null,
          serviceId: null,
          cveId: finding.cveId ?? null,
          title: finding.title,
          severity: finding.severity,
          cvssScore: finding.cvssScore ?? null,
          riskScore: finding.riskScore,
          description: finding.description ?? null,
        });
      }
    });

    return { ok: true as const, scanId: scanRun.id };
  }),

  diff: publicProcedure
    .input(
      z.object({
        baseScanId: z.string().uuid(),
        compareScanId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const baseDetail = await loadScanDetail(ctx.db, input.baseScanId);
      const compareDetail = await loadScanDetail(ctx.db, input.compareScanId);

      if (baseDetail === null || compareDetail === null) {
        return null;
      }

      const summary = diffScanRuns(baseDetail.scan, compareDetail.scan);
      return {
        baseScanId: input.baseScanId,
        compareScanId: input.compareScanId,
        newCount: summary.newFindings.length,
        resolvedCount: summary.resolvedFindings.length,
        unchangedCount: summary.unchangedCount,
        newFindings: summary.newFindings,
        resolvedFindings: summary.resolvedFindings,
      };
    }),
});
