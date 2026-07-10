import { afterEach, describe, expect, it } from 'vitest';
import { resolveRequestAuth } from './resolve-request-auth.js';

const ORIGINAL_ENV = {
  sync: process.env['SNIFFOUT_SYNC_TOKEN'],
  nodeEnv: process.env['NODE_ENV'],
  vercel: process.env['VERCEL'],
};

function restoreEnv(): void {
  if (ORIGINAL_ENV.sync === undefined) {
    delete process.env['SNIFFOUT_SYNC_TOKEN'];
  } else {
    process.env['SNIFFOUT_SYNC_TOKEN'] = ORIGINAL_ENV.sync;
  }
  if (ORIGINAL_ENV.nodeEnv === undefined) {
    delete process.env['NODE_ENV'];
  } else {
    process.env['NODE_ENV'] = ORIGINAL_ENV.nodeEnv;
  }
  if (ORIGINAL_ENV.vercel === undefined) {
    delete process.env['VERCEL'];
  } else {
    process.env['VERCEL'] = ORIGINAL_ENV.vercel;
  }
}

describe('resolveRequestAuth', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('allows sync in development when no SNIFFOUT_SYNC_TOKEN is configured', async () => {
    delete process.env['SNIFFOUT_SYNC_TOKEN'];
    delete process.env['VERCEL'];
    process.env['NODE_ENV'] = 'development';

    const auth = await resolveRequestAuth(new Request('http://localhost/api/trpc'));
    expect(auth.syncAuthorized).toBe(true);
  });

  it('rejects sync in production when SNIFFOUT_SYNC_TOKEN is unset (fail-closed)', async () => {
    delete process.env['SNIFFOUT_SYNC_TOKEN'];
    process.env['NODE_ENV'] = 'production';
    delete process.env['VERCEL'];

    const auth = await resolveRequestAuth(new Request('http://localhost/api/trpc'));
    expect(auth.syncAuthorized).toBe(false);
  });

  it('rejects sync in production when SNIFFOUT_SYNC_TOKEN is empty (fail-closed)', async () => {
    process.env['SNIFFOUT_SYNC_TOKEN'] = '';
    process.env['VERCEL'] = '1';
    process.env['NODE_ENV'] = 'development';

    const auth = await resolveRequestAuth(new Request('http://localhost/api/trpc'));
    expect(auth.syncAuthorized).toBe(false);
  });

  it('rejects sync when token is required and missing', async () => {
    process.env['SNIFFOUT_SYNC_TOKEN'] = 'lab-sync-secret';
    delete process.env['VERCEL'];
    process.env['NODE_ENV'] = 'development';

    const auth = await resolveRequestAuth(new Request('http://localhost/api/trpc'));
    expect(auth.syncAuthorized).toBe(false);
  });

  it('allows sync when bearer matches SNIFFOUT_SYNC_TOKEN', async () => {
    process.env['SNIFFOUT_SYNC_TOKEN'] = 'lab-sync-secret';
    delete process.env['VERCEL'];
    process.env['NODE_ENV'] = 'development';

    const auth = await resolveRequestAuth(
      new Request('http://localhost/api/trpc', {
        headers: { authorization: 'Bearer lab-sync-secret' },
      }),
    );
    expect(auth.syncAuthorized).toBe(true);
  });

  it('rejects sync when bearer length differs (constant-time path)', async () => {
    process.env['SNIFFOUT_SYNC_TOKEN'] = 'lab-sync-secret';
    const auth = await resolveRequestAuth(
      new Request('http://localhost/api/trpc', {
        headers: { authorization: 'Bearer wrong' },
      }),
    );
    expect(auth.syncAuthorized).toBe(false);
  });
});
