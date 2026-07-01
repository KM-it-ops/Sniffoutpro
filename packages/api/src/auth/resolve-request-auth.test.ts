import { describe, expect, it } from 'vitest';
import { resolveRequestAuth } from './resolve-request-auth.js';

describe('resolveRequestAuth', () => {
  it('allows sync when no SNIFFOUT_SYNC_TOKEN is configured', async () => {
    const prev = process.env['SNIFFOUT_SYNC_TOKEN'];
    delete process.env['SNIFFOUT_SYNC_TOKEN'];

    const auth = await resolveRequestAuth(new Request('http://localhost/api/trpc'));
    expect(auth.syncAuthorized).toBe(true);

    if (prev !== undefined) {
      process.env['SNIFFOUT_SYNC_TOKEN'] = prev;
    }
  });

  it('rejects sync when token is required and missing', async () => {
    process.env['SNIFFOUT_SYNC_TOKEN'] = 'lab-sync-secret';
    const auth = await resolveRequestAuth(new Request('http://localhost/api/trpc'));
    expect(auth.syncAuthorized).toBe(false);
    delete process.env['SNIFFOUT_SYNC_TOKEN'];
  });

  it('allows sync when bearer matches SNIFFOUT_SYNC_TOKEN', async () => {
    process.env['SNIFFOUT_SYNC_TOKEN'] = 'lab-sync-secret';
    const auth = await resolveRequestAuth(
      new Request('http://localhost/api/trpc', {
        headers: { authorization: 'Bearer lab-sync-secret' },
      }),
    );
    expect(auth.syncAuthorized).toBe(true);
    delete process.env['SNIFFOUT_SYNC_TOKEN'];
  });
});
