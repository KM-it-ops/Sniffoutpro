import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import type { Database } from '@sniffoutpro/db';
import { authorizationScopes, memberships, scanRuns } from '@sniffoutpro/db/schema';
import { scansVisibleTo } from './access.js';

export async function assertScanInCallerOrg(
  db: Database,
  userId: string,
  scanId: string,
): Promise<'missing' | 'ok'> {
  const memberRows = await db
    .select({ orgId: memberships.orgId })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active')));
  const orgIds = memberRows.map((row) => row.orgId);
  const [owned] = await db
    .select({ orgId: scanRuns.orgId, authorizationScopeId: scanRuns.authorizationScopeId })
    .from(scanRuns)
    .where(eq(scanRuns.id, scanId))
    .limit(1);
  if (owned === undefined) {
    return 'missing';
  }
  if (owned.orgId === null) {
    const [scope] = await db
      .select({ userId: authorizationScopes.userId })
      .from(authorizationScopes)
      .where(eq(authorizationScopes.id, owned.authorizationScopeId))
      .limit(1);
    if (scope?.userId !== userId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'That scan belongs to another account',
      });
    }
    return 'ok';
  }
  if (scansVisibleTo([owned], orgIds).length === 0) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'That scan belongs to another organization',
    });
  }
  return 'ok';
}
