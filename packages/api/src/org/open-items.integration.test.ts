// Needs local Postgres (docker compose -f docker/docker-compose.dev.yml up -d) with migrations applied.
// Open items N3, N5, N6, N7 from the re-review of cf90d58-F1 (C:\AI\reviews\sniffoutpro\fix-review-cf90d58.md).
import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, withMemberRole } from '@sniffoutpro/db';
import {
  authorizationScopes,
  hosts,
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

const ADMIN = 'd1000001-0000-4000-8000-000000000001';
const ADMIN_2 = 'd1000001-0000-4000-8000-000000000002';
const VIEWER = 'd1000001-0000-4000-8000-000000000003';
const ANALYST = 'd1000001-0000-4000-8000-000000000004';
const OUTSIDER = 'd1000001-0000-4000-8000-000000000005';
const ORG = 'd2000002-0000-4000-8000-000000000001';
const ORPHAN_ORG = 'd2000002-0000-4000-8000-000000000002';
const SCOPE = 'd3000003-0000-4000-8000-000000000001';
const VIEWER_SCOPE = 'd3000003-0000-4000-8000-000000000002';
const SCAN = 'd4000004-0000-4000-8000-000000000001';
const ALL_USERS = [ADMIN, ADMIN_2, VIEWER, ANALYST, OUTSIDER];

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

describe('re-review open items N3, N5, N6, N7', () => {
  const db = createDb(DATABASE_URL);
  const createCaller = createCallerFactory(appRouter);
  const logger = createLogger('open-items-integration-test');
  let ready = false;

  function as(userId: string) {
    return createCaller({ db, logger, userId, tier: 'WORKSTATION', syncAuthorized: true });
  }
  const run = (userId: string, query: ReturnType<typeof sql>) =>
    withMemberRole(db, userId, (tx) => tx.execute(query));

  async function cleanup() {
    await db.delete(hosts).where(eq(hosts.scanRunId, SCAN));
    await db.delete(networks).where(eq(networks.orgId, ORG));
    await db.delete(scanRuns).where(inArray(scanRuns.authorizationScopeId, [SCOPE, VIEWER_SCOPE]));
    await db.delete(authorizationScopes).where(inArray(authorizationScopes.userId, ALL_USERS));
    await db.delete(memberships).where(inArray(memberships.userId, ALL_USERS));
    await db.delete(organizations).where(inArray(organizations.id, [ORG, ORPHAN_ORG]));
    await db.delete(users).where(inArray(users.id, ALL_USERS));
  }

  beforeAll(async () => {
    try {
      await db.execute(sql`select 1`);
      ready = true;
    } catch {
      ready = false;
      return;
    }
    await cleanup();
    await db.insert(users).values([
      { id: ADMIN, email: 'open-admin@example.test' },
      { id: ADMIN_2, email: 'open-admin2@example.test' },
      { id: VIEWER, email: 'open-viewer@example.test' },
      { id: ANALYST, email: 'open-analyst@example.test' },
      { id: OUTSIDER, email: 'open-outsider@example.test' },
    ]);
    await db.insert(organizations).values([
      { id: ORG, name: 'Open Org', slug: 'open-org' },
      // Its creator left long ago: no memberships at all.
      { id: ORPHAN_ORG, name: 'Orphan Org', slug: 'open-orphan-org' },
    ]);
    await db.insert(authorizationScopes).values([
      {
        id: SCOPE,
        userId: ADMIN,
        targets: ['127.0.0.1'],
        consentText: 'lab',
        consentedAt: new Date(),
      },
      {
        id: VIEWER_SCOPE,
        userId: VIEWER,
        targets: ['127.0.0.2'],
        consentText: 'lab',
        consentedAt: new Date(),
      },
    ]);
    await db.insert(scanRuns).values({
      id: SCAN,
      orgId: ORG,
      authorizationScopeId: SCOPE,
      status: 'completed',
      targets: ['127.0.0.1'],
      intensity: 'light',
    });
  });

  // Each test starts from the same members: one admin, one viewer, one analyst, and no networks.
  beforeEach(async () => {
    if (!ready) {
      return;
    }
    await db.delete(networks).where(eq(networks.orgId, ORG));
    await db.delete(memberships).where(inArray(memberships.userId, ALL_USERS));
    await db.insert(memberships).values([
      { orgId: ORG, userId: ADMIN, role: 'admin' },
      { orgId: ORG, userId: VIEWER, role: 'viewer' },
      { orgId: ORG, userId: ANALYST, role: 'analyst' },
    ]);
  });

  afterAll(async () => {
    if (ready) {
      await cleanup();
    }
    await db.close();
  });

  describe('N3: an organization always keeps an admin and cannot be claimed', () => {
    it('refuses an outsider making themselves admin of an organization with no members', async (ctx) => {
      if (!ready) {
        ctx.skip();
      }
      await refused(
        run(
          OUTSIDER,
          sql`insert into memberships (org_id, user_id, role, status) values (${ORPHAN_ORG}::uuid, ${OUTSIDER}::uuid, 'admin', 'active')`,
        ),
      );
      const rows = await db.select().from(memberships).where(eq(memberships.orgId, ORPHAN_ORG));
      expect(rows).toEqual([]);
    });

    it('refuses the last admin deleting every membership, or their own', async (ctx) => {
      if (!ready) {
        ctx.skip();
      }
      await refused(run(ADMIN, sql`delete from memberships where org_id = ${ORG}::uuid`));
      await refused(run(ADMIN, sql`delete from memberships where user_id = ${ADMIN}::uuid`));
      await refused(
        run(ADMIN, sql`update memberships set role = 'viewer' where user_id = ${ADMIN}::uuid`),
      );
      const left = await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(eq(memberships.orgId, ORG));
      expect(left).toHaveLength(3);
    });

    it('refuses two admins stepping down at the same time', async (ctx) => {
      if (!ready) {
        ctx.skip();
      }
      await db.insert(memberships).values({ orgId: ORG, userId: ADMIN_2, role: 'admin' });
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      // The first demotion stays uncommitted while the second one runs.
      const first = withMemberRole(db, ADMIN, async (tx) => {
        await tx.execute(
          sql`update memberships set role = 'viewer' where user_id = ${ADMIN}::uuid and org_id = ${ORG}::uuid`,
        );
        await held;
      });
      const second = run(
        ADMIN_2,
        sql`update memberships set role = 'viewer' where user_id = ${ADMIN_2}::uuid and org_id = ${ORG}::uuid`,
      );
      const outcomes = Promise.allSettled([first, second]);
      await new Promise((resolve) => setTimeout(resolve, 300));
      release();
      await outcomes;
      const admins = await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(and(eq(memberships.orgId, ORG), eq(memberships.role, 'admin')));
      expect(admins).toHaveLength(1);
    });

    it('still lets an admin step down once another admin is active', async (ctx) => {
      if (!ready) {
        ctx.skip();
      }
      await db.insert(memberships).values({ orgId: ORG, userId: ADMIN_2, role: 'admin' });
      await run(
        ADMIN,
        sql`update memberships set role = 'analyst' where user_id = ${ADMIN}::uuid and org_id = ${ORG}::uuid`,
      );
      await run(
        ADMIN_2,
        sql`update memberships set role = 'admin' where user_id = ${ADMIN}::uuid and org_id = ${ORG}::uuid`,
      );
      await db
        .delete(memberships)
        .where(and(eq(memberships.userId, ADMIN_2), eq(memberships.orgId, ORG)));
      const [row] = await db
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.userId, ADMIN), eq(memberships.orgId, ORG)));
      expect(row).toEqual({ role: 'admin' });
    });

    it('refuses an invitee rewriting their membership id while accepting', async (ctx) => {
      if (!ready) {
        ctx.skip();
      }
      await db
        .insert(memberships)
        .values({ orgId: ORG, userId: OUTSIDER, role: 'viewer', status: 'pending' });
      await refused(
        run(
          OUTSIDER,
          sql`update memberships set status = 'active', id = gen_random_uuid() where user_id = ${OUTSIDER}::uuid`,
        ),
      );
    });
  });

  describe('N5: invite does not reveal whether an email has an account', () => {
    it('answers the same for an unknown email as for a new invite', async (ctx) => {
      if (!ready) {
        ctx.skip();
      }
      const unknown = await as(ADMIN).organizations.invite({
        orgId: ORG,
        email: 'nobody-here@example.test',
        role: 'viewer',
      });
      const known = await as(ADMIN).organizations.invite({
        orgId: ORG,
        email: 'open-outsider@example.test',
        role: 'viewer',
      });
      expect(unknown).toEqual(known);
    });

    it('matches the email regardless of letter case', async (ctx) => {
      if (!ready) {
        ctx.skip();
      }
      await as(ADMIN).organizations.invite({
        orgId: ORG,
        email: 'Open-Outsider@Example.TEST',
        role: 'viewer',
      });
      const rows = await db
        .select({ status: memberships.status })
        .from(memberships)
        .where(and(eq(memberships.userId, OUTSIDER), eq(memberships.orgId, ORG)));
      expect(rows).toEqual([{ status: 'pending' }]);
    });
  });

  describe('N6: the database refuses viewer writes, not only the API', () => {
    it('refuses a viewer writing organization rows', async (ctx) => {
      if (!ready) {
        ctx.skip();
      }
      await refused(
        withMemberRole(db, VIEWER, (tx) =>
          tx.insert(networks).values({ orgId: ORG, name: 'viewer-net', cidr: '10.7.0.0/24' }),
        ),
      );
      await refused(
        withMemberRole(db, VIEWER, (tx) =>
          tx.insert(hosts).values({ scanRunId: SCAN, orgId: ORG, ip: '127.0.0.9' }),
        ),
      );
      // Update and delete find no row a viewer may change: nothing happens.
      await run(VIEWER, sql`update scan_runs set status = 'failed' where id = ${SCAN}::uuid`);
      await run(VIEWER, sql`delete from scan_runs where id = ${SCAN}::uuid`);
      const [scan] = await db
        .select({ status: scanRuns.status })
        .from(scanRuns)
        .where(eq(scanRuns.id, SCAN));
      expect(scan).toEqual({ status: 'completed' });
      // A viewer still reads the organization's scan.
      const seen = await withMemberRole(db, VIEWER, (tx) =>
        tx.select({ id: scanRuns.id }).from(scanRuns).where(eq(scanRuns.id, SCAN)),
      );
      expect(seen).toEqual([{ id: SCAN }]);
    });

    it('refuses a viewer-only person a personal upload', async (ctx) => {
      if (!ready) {
        ctx.skip();
      }
      await refused(
        withMemberRole(db, VIEWER, (tx) =>
          tx.insert(scanRuns).values({
            orgId: null,
            authorizationScopeId: VIEWER_SCOPE,
            status: 'completed',
            targets: ['127.0.0.2'],
            intensity: 'light',
          }),
        ),
      );
    });

    it('still lets an analyst write organization rows', async (ctx) => {
      if (!ready) {
        ctx.skip();
      }
      await withMemberRole(db, ANALYST, (tx) =>
        tx.insert(networks).values({ orgId: ORG, name: 'analyst-net', cidr: '10.6.0.0/24' }),
      );
      const rows = await db
        .select({ name: networks.name })
        .from(networks)
        .where(eq(networks.orgId, ORG));
      expect(rows).toEqual([{ name: 'analyst-net' }]);
    });
  });

  describe('N7: requests do not queue behind each other on one connection', () => {
    it('answers a query while another request holds a transaction open', async (ctx) => {
      if (!ready) {
        ctx.skip();
      }
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const open = withMemberRole(db, ADMIN, async () => {
        await held;
      });
      const other = db.execute(sql`select 1 as one`).then(() => 'answered' as const);
      const timeout = new Promise<'queued'>((resolve) =>
        setTimeout(() => {
          resolve('queued');
        }, 2000),
      );
      const outcome = await Promise.race([other, timeout]);
      release();
      await open;
      await other;
      expect(outcome).toBe('answered');
    });
  });
});
