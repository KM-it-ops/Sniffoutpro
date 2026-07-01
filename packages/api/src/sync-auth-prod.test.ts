import { createCallerFactory } from './trpc.js';
import { appRouter } from './router.js';
import { createLogger } from './logger.js';
import { describe, expect, it, afterEach } from 'vitest';

const createCaller = createCallerFactory(appRouter);
const logger = createLogger('sync-auth-prod-test');

describe('production sync auth gate', () => {
  afterEach(() => {
    delete process.env['SNIFFOUT_SYNC_TOKEN'];
  });

  it('rejects scans.sync when token required and caller is not authorized', async () => {
    process.env['SNIFFOUT_SYNC_TOKEN'] = 'prod-sync-secret';

    const caller = createCaller({
      db: {} as never,
      logger,
      userId: null,
      tier: 'WORKSTATION',
      syncAuthorized: false,
    });

    await expect(
      caller.scans.sync({
        consentText: 'test',
        scanRun: {
          id: crypto.randomUUID(),
          status: 'completed',
          targets: ['127.0.0.1'],
          intensity: 'light',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          hosts: [],
          findings: [],
        },
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
