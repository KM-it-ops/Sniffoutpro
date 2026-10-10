// Needs local Postgres (docker compose -f docker/docker-compose.dev.yml up -d) with migrations applied.
import { and, eq, inArray, sql } from 'drizzle-orm';
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
import { createCallerFactory, protectedProcedure, router } from '../trpc.js';

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const USER_A = 'a0000001-0000-4000-8000-000000000001';
const USER_B = 'b0000001-0000-4000-8000-000000000001';
const USER_C = 'c0000001-0000-4000-8000-000000000001';
const ORG_A = 'a0000002-0000-4000-8000-000000000002';
const ORG_B = 'b0000002-0000-4000-8000-000000000002';
const SCOPE_A = 'a0000003-0000-4000-8000-000000000003';
const SCOPE_B = 'b0000003-0000-4000-8000-000000000003';
const SCAN_A = 'a0000004-0000-4000-8000-000000000004';
const SCAN_B = 'b0000004-0000-4000-8000-000000000004';

// Passes only when the database itself refused the statement (insufficient_privilege), not on any other error.
async function refused(work: Promise<unknown>) {
  const err: unknown = await work.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  let code: unknown;
  for (let cur: unknown = err; cur instanceof Error; cur = cur.cause) {
    code = (cur as Error & { code?: unknown }).code ?? code;
  }
  expect(code).toBe('42501');
}

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
      { id: USER_C, email: 'rls-c@example.test' },
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
      await db.delete(memberships).where(eq(memberships.userId, USER_C));
      await db.delete(organizations).where(inArray(organizations.id, [ORG_A, ORG_B]));
      await db.delete(organizations).where(eq(organizations.slug, 'rls-org-c'));
      await db.delete(users).where(inArray(users.id, [USER_A, USER_B, USER_C]));
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
    await refused(
      withMemberRole(db, USER_A, (tx) =>
        tx.insert(networks).values({ orgId: ORG_B, name: 'planted', cidr: '10.9.0.0/24' }),
      ),
    );
    const planted = await db.select({ id: networks.id }).from(networks).where(eq(networks.orgId, ORG_B));
    expect(planted).toEqual([]);
  });

  it('lets an invited person accept an invite but not change its role or organization', async (ctx) => {
    if (!ready) {
      ctx.skip();
    }
    await db.insert(memberships).values({ orgId: ORG_A, userId: USER_C, role: 'viewer', status: 'pending' });
    const asC = (query: ReturnType<typeof sql>) => withMemberRole(db, USER_C, (tx) => tx.execute(query));
    await refused(asC(sql`update memberships set status = 'active', role = 'admin' where user_id = ${USER_C}::uuid`));
    await refused(
      asC(sql`update memberships set status = 'active', org_id = ${ORG_B}::uuid where user_id = ${USER_C}::uuid`),
    );
    const stillPending = await db
      .select({ orgId: memberships.orgId, role: memberships.role, status: memberships.status })
      .from(memberships)
      .where(eq(memberships.userId, USER_C));
    expect(stillPending).toEqual([{ orgId: ORG_A, role: 'viewer', status: 'pending' }]);

    await expect(as(USER_C).organizations.acceptInvite({ orgId: ORG_A })).resolves.toEqual({
      orgId: ORG_A,
      role: 'viewer',
    });
  });

  it('keeps consent with the invited person: an admin cannot add or activate a member directly', async (ctx) => {
    if (!ready) {
      ctx.skip();
    }
    await db.delete(memberships).where(eq(memberships.userId, USER_C));
    const asAdmin = (query: ReturnType<typeof sql>) => withMemberRole(db, USER_A, (tx) => tx.execute(query));
    await refused(
      asAdmin(sql`insert into memberships (org_id, user_id, role, status) values (${ORG_A}::uuid, ${USER_C}::uuid, 'viewer', 'active')`),
    );
    // Nor can an outsider make themselves admin of an organization that already has members.
    await refused(
      withMemberRole(db, USER_B, (tx) =>
        tx.execute(sql`insert into memberships (org_id, user_id, role, status) values (${ORG_A}::uuid, ${USER_B}::uuid, 'admin', 'active')`),
      ),
    );
    await asAdmin(
      sql`insert into memberships (org_id, user_id, role, status) values (${ORG_A}::uuid, ${USER_C}::uuid, 'viewer', 'pending')`,
    );
    await refused(asAdmin(sql`update memberships set status = 'active' where user_id = ${USER_C}::uuid`));
    // An admin may still change a role in their own organization.
    await asAdmin(sql`update memberships set role = 'analyst' where user_id = ${USER_C}::uuid`);
    const [row] = await db
      .select({ role: memberships.role, status: memberships.status })
      .from(memberships)
      .where(eq(memberships.userId, USER_C));
    expect(row).toEqual({ role: 'analyst', status: 'pending' });
  });

  it('still lets a signed-in person create an organization and become its first admin', async (ctx) => {
    if (!ready) {
      ctx.skip();
    }
    const org = await as(USER_C).organizations.create({ name: 'RLS Org C', slug: 'rls-org-c' });
    const [row] = await db
      .select({ role: memberships.role, status: memberships.status })
      .from(memberships)
      .where(and(eq(memberships.orgId, org.id), eq(memberships.userId, USER_C)));
    expect(row).toEqual({ role: 'admin', status: 'active' });
  });

  it('rolls back the writes of a procedure that fails after writing', async (ctx) => {
    if (!ready) {
      ctx.skip();
    }
    const failing = router({
      writeThenFail: protectedProcedure.mutation(async ({ ctx: c }) => {
        await c.db.insert(networks).values({ orgId: ORG_A, name: 'rolled-back', cidr: '10.8.0.0/24' });
        throw new Error('fails after writing');
      }),
    });
    const call = createCallerFactory(failing)({ db, logger, userId: USER_A, tier: 'WORKSTATION', syncAuthorized: false });
    await expect(call.writeThenFail()).rejects.toThrow('fails after writing');
    const kept = await db.select({ id: networks.id }).from(networks).where(eq(networks.name, 'rolled-back'));
    expect(kept).toEqual([]);
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
