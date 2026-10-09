import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '@sniffoutpro/db';
import {
  authorizationScopes,
  cveCache,
  findings,
  hosts,
  memberships,
  scanRuns,
  services,
} from '@sniffoutpro/db/schema';
import { canSync, parseOrgRole } from '../org/access.js';
import { assertScanInCallerOrg } from '../org/scan-guard.js';
import { diffScanRuns } from '@sniffoutpro/scan-engine';
import {
  FindingSchema,
  HostSchema,
  ScanProvenanceEnum,
  ScanRunSchema,
  type ScanProvenance,
  type ScanRun,
} from '@sniffoutpro/types';
import { assertRateLimit } from '../rate-limit.js';
import { requireTierFeature, router, protectedProcedure } from '../trpc.js';

const SyncScanInputSchema = z.object({
  consentText: z.string().min(1),
  scanRun: ScanRunSchema,
  rawOutput: z.string().optional(),
  // Upload into this organization; without it the scan stays personal.
  orgId: z.string().uuid().optional(),
});

/**
 * C3 (docs/AUDIT-RESIDUAL-2026-07-09.md): persist fixture provenance through
 * cloud sync so fixture data is never mistaken for live findings.
 *
 * Trust boundary: `source` is client-asserted (shape-validated by
 * ScanRunSchema, origin unverified) — a labeling aid, not an integrity signal.
 */
export function toNormalizedOutput(scanRun: ScanRun): {
  hosts: ScanRun['hosts'];
  findings: ScanRun['findings'];
  source?: ScanProvenance;
} {
  return {
    hosts: scanRun.hosts,
    findings: scanRun.findings,
    ...(scanRun.source !== undefined ? { source: scanRun.source } : {}),
  };
}

const ProvenanceProbeSchema = z.object({ source: ScanProvenanceEnum });

/**
 * Extract scan provenance from a stored `normalized_output` jsonb payload.
 * Returns `undefined` for legacy or malformed payloads — treat `undefined`
 * as UNVERIFIED provenance; never default it to 'live'.
 */
export function provenanceFromNormalizedOutput(value: unknown): ScanProvenance | undefined {
  const parsed = ProvenanceProbeSchema.safeParse(value);
  return parsed.success ? parsed.data.source : undefined;
}

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
      port: f.port ?? undefined,
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
      source: provenanceFromNormalizedOutput(run.normalizedOutput),
    }),
  };
}

export const scansRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      assertRateLimit(ctx.userId ?? 'anon', {
        prefix: 'scans.list',
        limit: 120,
        windowMs: 60_000,
      });
      const limit = input?.limit ?? 50;
      ctx.logger.debug({ limit }, 'scans.list');
      if (ctx.userId === null) {
        return [];
      }
      const memberRows = await ctx.db
        .select({ orgId: memberships.orgId })
        .from(memberships)
        .where(and(eq(memberships.userId, ctx.userId), eq(memberships.status, 'active')));
      const orgIds = memberRows.map((row) => row.orgId);
      if (orgIds.length === 0) {
        return ctx.db
          .select({
            id: scanRuns.id,
            orgId: scanRuns.orgId,
            status: scanRuns.status,
            targets: scanRuns.targets,
            intensity: scanRuns.intensity,
            startedAt: scanRuns.startedAt,
            completedAt: scanRuns.completedAt,
          })
          .from(scanRuns)
          .innerJoin(authorizationScopes, eq(scanRuns.authorizationScopeId, authorizationScopes.id))
          .where(and(isNull(scanRuns.orgId), eq(authorizationScopes.userId, ctx.userId)))
          .orderBy(desc(scanRuns.startedAt))
          .limit(limit);
      }
      const rows = await ctx.db
        .select({
          id: scanRuns.id,
          orgId: scanRuns.orgId,
          status: scanRuns.status,
          targets: scanRuns.targets,
          intensity: scanRuns.intensity,
          startedAt: scanRuns.startedAt,
          completedAt: scanRuns.completedAt,
        })
        .from(scanRuns)
        .innerJoin(authorizationScopes, eq(scanRuns.authorizationScopeId, authorizationScopes.id))
        // The caller's organizations' scans, plus their own personal uploads.
        .where(
          or(
            inArray(scanRuns.orgId, orgIds),
            and(isNull(scanRuns.orgId), eq(authorizationScopes.userId, ctx.userId)),
          ),
        )
        .orderBy(desc(scanRuns.startedAt))
        .limit(limit);
      return rows;
    }),

  getDetail: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      assertRateLimit(ctx.userId ?? 'anon', {
        prefix: 'scans.getDetail',
        limit: 120,
        windowMs: 60_000,
      });
      if (ctx.userId === null) {
        return null;
      }
      const seen = await assertScanInCallerOrg(ctx.db, ctx.userId, input.id);
      if (seen === 'missing') {
        return null;
      }
      return loadScanDetail(ctx.db, input.id);
    }),

  sync: requireTierFeature('cloudSync')
    .input(SyncScanInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { scanRun, consentText, rawOutput } = input;
      ctx.logger.info({ scanId: scanRun.id, targets: scanRun.targets }, 'scans.sync');
      const memberRows =
        ctx.userId === null
          ? []
          : await ctx.db
              .select({ orgId: memberships.orgId, role: memberships.role })
              .from(memberships)
              .where(and(eq(memberships.userId, ctx.userId), eq(memberships.status, 'active')));
      // Someone whose every organization role is viewer may not upload at all, not even personally.
      const roles = memberRows.map((row) => parseOrgRole(row.role));
      if (roles.length > 0 && !roles.some((role) => role !== null && canSync(role))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Viewers cannot upload scans' });
      }
      let orgId: string | null = null;
      if (input.orgId !== undefined) {
        const target = memberRows.find((row) => row.orgId === input.orgId);
        const role = parseOrgRole(target?.role);
        if (role === null || !canSync(role)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Your role cannot upload scans to that organization',
          });
        }
        orgId = input.orgId;
      }

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
          orgId,
          authorizationScopeId: scopeId,
          status: scanRun.status,
          targets: scanRun.targets,
          intensity: scanRun.intensity,
          startedAt: new Date(scanRun.startedAt),
          completedAt: scanRun.completedAt !== undefined ? new Date(scanRun.completedAt) : null,
          rawOutput: rawOutput ?? null,
          normalizedOutput: toNormalizedOutput(scanRun),
        });

        const hostIdByIp = new Map<string, string>();
        const serviceIdByKey = new Map<string, string>();

        for (const host of scanRun.hosts) {
          const hostId = crypto.randomUUID();
          hostIdByIp.set(host.ip, hostId);
          await tx.insert(hosts).values({
            id: hostId,
            scanRunId: scanRun.id,
            orgId,
            ip: host.ip,
            hostname: host.hostname ?? null,
            mac: host.mac ?? null,
            os: host.os ?? null,
            osConfidence: host.osConfidence ?? null,
          });

          for (const svc of host.services) {
            const serviceId = crypto.randomUUID();
            serviceIdByKey.set(`${host.ip}:${String(svc.port)}:${svc.protocol}`, serviceId);
            await tx.insert(services).values({
              id: serviceId,
              hostId,
              orgId,
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
          const serviceKey =
            finding.port !== undefined
              ? `${finding.hostIp}:${String(finding.port)}:tcp`
              : undefined;
          await tx.insert(findings).values({
            id: finding.id,
            scanRunId: scanRun.id,
            orgId,
            hostId: hostIdByIp.get(finding.hostIp) ?? null,
            serviceId: serviceKey !== undefined ? (serviceIdByKey.get(serviceKey) ?? null) : null,
            cveId: finding.cveId ?? null,
            title: finding.title,
            severity: finding.severity,
            cvssScore: finding.cvssScore ?? null,
            riskScore: finding.riskScore,
            description: finding.description ?? null,
            port: finding.port ?? null,
          });
        }
      });

      return { ok: true as const, scanId: scanRun.id };
    }),

  diff: protectedProcedure
    .input(
      z.object({
        baseScanId: z.string().uuid(),
        compareScanId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      assertRateLimit(ctx.userId ?? 'anon', {
        prefix: 'scans.diff',
        limit: 60,
        windowMs: 60_000,
      });
      if (ctx.userId === null) {
        return null;
      }
      const baseSeen = await assertScanInCallerOrg(ctx.db, ctx.userId, input.baseScanId);
      const compareSeen = await assertScanInCallerOrg(ctx.db, ctx.userId, input.compareScanId);
      if (baseSeen === 'missing' || compareSeen === 'missing') {
        return null;
      }
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
