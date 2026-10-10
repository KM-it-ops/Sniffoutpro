// Review reproduction test for commit cf90d58 (temporary file; permanent copy lives in the review record).
// Needs local Postgres (docker compose -f docker/docker-compose.dev.yml up -d) with migrations applied.
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from '@sniffoutpro/db';
import {
  authorizationScopes,
  memberships,
  organizations,
  scanRuns,
  users,
} from '@sniffoutpro/db/schema';
import { createLogger } from './logger.js';
import { appRouter } from './router.js';
import { createCallerFactory } from './trpc.js';

const URL = process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const db = createDb(URL);
const createCaller = createCallerFactory(appRouter);
const logger = createLogger('review-db-test');
const ATTACKER = 'a1111111-1111-4111-8111-111111111111';
const VICTIM = 'b2222222-2222-4222-8222-222222222222';
const ORG = 'c3333333-3333-4333-8333-333333333333';
const SCAN = 'd4444444-4444-4444-8444-444444444444';

function as(userId: string) {
  return createCaller({ db, logger, userId, tier: 'WORKSTATION', syncAuthorized: true });
}

afterAll(async () => {
  await db.delete(scanRuns).where(eq(scanRuns.id, SCAN));
  await db.delete(authorizationScopes).where(inArray(authorizationScopes.userId, [VICTIM]));
  await db.delete(memberships).where(eq(memberships.orgId, ORG));
  await db.delete(organizations).where(eq(organizations.id, ORG));
  await db.delete(users).where(inArray(users.id, [ATTACKER, VICTIM]));
  await db.close();
});

describe('invited-without-consent: a victim upload lands in the inviter org', () => {
  it('does not let an org admin read a scan the invited person uploads', async () => {
    await db.insert(users).values([
      { id: ATTACKER, email: 'rv-attacker@example.test' },
      { id: VICTIM, email: 'rv-victim@example.test' },
    ]);
    await db.insert(organizations).values({ id: ORG, name: 'RV Org', slug: 'rv-org-cf90d58' });
    await db.insert(memberships).values({ orgId: ORG, userId: ATTACKER, role: 'admin' });

    // The admin adds the victim as a viewer. The victim never accepts anything.
    await as(ATTACKER).organizations.invite({
      orgId: ORG,
      email: 'rv-victim@example.test',
      role: 'viewer',
    });

    // The victim, who thinks they are uploading a private scan, syncs.
    await as(VICTIM).scans.sync({
      consentText: 'my own lab',
      scanRun: {
        id: SCAN,
        status: 'completed',
        targets: ['192.168.50.7'],
        intensity: 'light',
        startedAt: '2026-10-08T12:00:00.000Z',
        completedAt: '2026-10-08T12:05:00.000Z',
        hosts: [],
        findings: [],
      },
    });

    // The scan was stored, and is personal to the victim.
    const [stored] = await db.select({ orgId: scanRuns.orgId }).from(scanRuns).where(eq(scanRuns.id, SCAN));
    expect(stored).toEqual({ orgId: null });
    // The admin must NOT be able to see it. Row security hides it entirely, so it reads as missing.
    await expect(as(ATTACKER).scans.getDetail({ id: SCAN })).resolves.toBeNull();
  });
});
