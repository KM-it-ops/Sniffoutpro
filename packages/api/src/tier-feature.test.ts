import { describe, expect, it } from 'vitest';
import type { Tier } from '@sniffoutpro/types';
import { createLogger } from './logger.js';
import { requireTierFeature, router, createCallerFactory } from './trpc.js';
import { memberDb } from './test-support/member-db.js';

const featureRouter = router({
  report: requireTierFeature('reports').query(() => 'ok' as const),
});
const createCaller = createCallerFactory(featureRouter);
const logger = createLogger('tier-feature-test');

function caller(tier: Tier) {
  return createCaller({
    db: memberDb({}),
    logger,
    userId: '11111111-1111-4111-8111-111111111111',
    tier,
    syncAuthorized: false,
  });
}

describe('requireTierFeature', () => {
  it('refuses a report for a workstation user', async () => {
    await expect(caller('WORKSTATION').report()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows a report for a consultant user', async () => {
    await expect(caller('CONSULTANT').report()).resolves.toBe('ok');
  });
});
