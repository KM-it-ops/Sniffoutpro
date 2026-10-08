import { describe, expect, it } from 'vitest';
import type { Database } from '@sniffoutpro/db';
import { createCallerFactory } from '../trpc.js';
import { appRouter } from '../router.js';
import { createLogger } from '../logger.js';

const createCaller = createCallerFactory(appRouter);
const logger = createLogger('auth-test');
const USER_ID = '11111111-1111-4111-8111-111111111111';

function callerWithEmail(email: string | null) {
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(email === null ? [] : [{ email }]),
        }),
      }),
    }),
  } as unknown as Database;

  return createCaller({
    db,
    logger,
    userId: USER_ID,
    tier: 'WORKSTATION',
    syncAuthorized: true,
  });
}

describe('auth.me', () => {
  it('rejects a request with no user', async () => {
    const caller = createCaller({
      db: {} as Database,
      logger,
      userId: null,
      tier: 'WORKSTATION',
      syncAuthorized: false,
    });

    await expect(caller.auth.me()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('returns email when the user row exists', async () => {
    const caller = callerWithEmail('analyst@example.com');
    await expect(caller.auth.me()).resolves.toEqual({
      userId: USER_ID,
      tier: 'WORKSTATION',
      email: 'analyst@example.com',
    });
  });

  it('returns a null email when the user row is missing', async () => {
    const caller = callerWithEmail(null);
    await expect(caller.auth.me()).resolves.toEqual({
      userId: USER_ID,
      tier: 'WORKSTATION',
      email: null,
    });
  });
});
