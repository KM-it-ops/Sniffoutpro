// Needs local Postgres (docker compose -f docker/docker-compose.dev.yml up -d) with migrations applied.
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, withMemberRole } from '@sniffoutpro/db';
import {
  authorizationScopes,
  memberships,
  networks,
  organizations,
  scanRuns,
  users,
} from '@sniffoutpro/db/schema';
import { createLogger } from '../logger.js';
import { appRouter } from '../router.js';
import { createCallerFactory } from '../trpc.js';

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const USER_A = 'a0000001-0000-4000-8000-000000000001';
const USER_B = 'b0000001-0000-4000-8000-000000000001';
const ORG_A = 'a0000002-0000-4000-8000-000000000002';
const ORG_B = 'b0000002-0000-4000-8000-000000000002';
const SCOPE_A = 'a0000003-0000-4000-8000-000000000003';
const SCOPE_B = 'b0000003-0000-4000-8000-000000000003';
const SCAN_A = 'a0000004-0000-4000-8000-000000000004';
const SCAN_B = 'b0000004-0000-4000-8000-000000000004';

describe('sniffout_member row security on the API connection', () => {
  const db = createDb(DATABASE_URL);
  const createCaller = createCallerFactory(appRouter);
  const logger = createLogger('rls-integration-test');
  let ready = false;

  function as(userId: string) {
    return createCaller({ db, logger, userId, tier: 'WORKSTATION', syncAuthorized: true });
  }

  beforeAll(async () => {
    try {
      await db.execute(sql`select 1`);
      ready = true;
    } catch {
      ready = false;
      return;
    }
    // Seeded on the owner connection, which row security does not apply to.
    await db.insert(users).values([
      { id: USER_A, email: 'rls-a@example.test' },
      { id: USER_B, email: 'rls-b@example.test' },
    ]);
    await db.insert(organizations).values([
      { id: ORG_A, name: 'RLS Org A', slug: 'rls-org-a' },
      { id: ORG_B, name: 'RLS Org B', slug: 'rls-org-b' },
    ]);
    await db.insert(memberships).values([
      { orgId: ORG_A, userId: USER_A, role: 'admin' },
      { orgId: ORG_B, userId: USER_B, role: 'admin' },
    ]);
    await db.insert(authorizationScopes).values([
      { id: SCOPE_A, userId: USER_A, targets: ['127.0.0.1'], consentText: 'lab A', consentedAt: new Date() },
      { id: SCOPE_B, userId: USER_B, targets: ['10.0.0.1'], consentText: 'lab B', consentedAt: new Date() },
    ]);
    await db.insert(scanRuns).values([
      {
        id: SCAN_A,
        orgId: ORG_A,
        authorizationScopeId: SCOPE_A,
        status: 'completed',
        targets: ['127.0.0.1'],
        intensity: 'light',
      },
      {
        id: SCAN_B,
        orgId: ORG_B,
        authorizationScopeId: SCOPE_B,
        status: 'completed',
        targets: ['10.0.0.1'],
        intensity: 'light',
      },
    ]);
  });

  afterAll(async () => {
    if (ready) {
      await db.delete(networks).where(inArray(networks.orgId, [ORG_A, ORG_B]));
      await db.delete(scanRuns).where(inArray(scanRuns.id, [SCAN_A, SCAN_B]));
      await db.delete(authorizationScopes).where(inArray(authorizationScopes.id, [SCOPE_A, SCOPE_B]));
      await db.delete(memberships).where(inArray(memberships.orgId, [ORG_A, ORG_B]));
      await db.delete(organizations).where(inArray(organizations.id, [ORG_A, ORG_B]));
      await db.delete(users).where(inArray(users.id, [USER_A, USER_B]));
    }
    await db.close();
  });

  it('returns no row for a guessed org B scan id when acting for org A', async (ctx) => {
    if (!ready) {
      ctx.skip();
    }
    // The owner connection sees both, so an empty answer below is row security, not missing data.
    const both = await db.select({ id: scanRuns.id }).from(scanRuns).where(inArray(scanRuns.id, [SCAN_A, SCAN_B]));
    expect(both.map((row) => row.id).sort()).toEqual([SCAN_A, SCAN_B]);

    const direct = await withMemberRole(db, USER_A, (tx) =>
      tx.select({ id: scanRuns.id }).from(scanRuns).where(eq(scanRuns.id, SCAN_B)),
    );
    expect(direct).toEqual([]);

    await expect(as(USER_A).scans.getDetail({ id: SCAN_B })).resolves.toBeNull();
    const listed = await as(USER_A).scans.list();
    expect(listed.map((row) => row.id)).toContain(SCAN_A);
    expect(listed.map((row) => row.id)).not.toContain(SCAN_B);
  });

  it('refuses a write into an organization the person does not belong to', async (ctx) => {
    if (!ready) {
      ctx.skip();
    }
    await expect(
      withMemberRole(db, USER_A, (tx) =>
        tx.insert(networks).values({ orgId: ORG_B, name: 'planted', cidr: '10.9.0.0/24' }),
      ),
    ).rejects.toThrow();
    const planted = await db.select({ id: networks.id }).from(networks).where(eq(networks.orgId, ORG_B));
    expect(planted).toEqual([]);
  });

  it('runs the role switch only for the request, not the shared connection', async (ctx) => {
    if (!ready) {
      ctx.skip();
    }
    await withMemberRole(db, USER_A, async (tx) => tx.execute(sql`select 1`));
    const after = await db.execute<{ role: string }>(sql`select current_user as role`);
    expect(after[0]?.role).not.toBe('sniffout_member');
  });
});
