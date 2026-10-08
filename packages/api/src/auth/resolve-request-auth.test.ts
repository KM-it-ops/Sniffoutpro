import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveRequestAuth } from './resolve-request-auth.js';

const ORIGINAL_ENV = {
  sync: process.env['SNIFFOUT_SYNC_TOKEN'],
  nodeEnv: process.env['NODE_ENV'],
  vercel: process.env['VERCEL'],
  supabaseUrl: process.env['SUPABASE_URL'],
  supabaseAnonKey: process.env['SUPABASE_ANON_KEY'],
};

const AUTH_USER_ID = '11111111-1111-4111-8111-111111111111';

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
  if (ORIGINAL_ENV.supabaseUrl === undefined) {
    delete process.env['SUPABASE_URL'];
  } else {
    process.env['SUPABASE_URL'] = ORIGINAL_ENV.supabaseUrl;
  }
  if (ORIGINAL_ENV.supabaseAnonKey === undefined) {
    delete process.env['SUPABASE_ANON_KEY'];
  } else {
    process.env['SUPABASE_ANON_KEY'] = ORIGINAL_ENV.supabaseAnonKey;
  }
  vi.unstubAllGlobals();
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

  it('leaves userId null when no bearer is sent', async () => {
    delete process.env['SUPABASE_URL'];
    delete process.env['SUPABASE_ANON_KEY'];
    delete process.env['SNIFFOUT_SYNC_TOKEN'];
    process.env['NODE_ENV'] = 'development';

    const auth = await resolveRequestAuth(new Request('http://localhost/api/trpc'));
    expect(auth.userId).toBeNull();
  });

  it('sets userId from a Supabase user response', async () => {
    process.env['SUPABASE_URL'] = 'https://example.supabase.co';
    process.env['SUPABASE_ANON_KEY'] = 'anon-key';
    delete process.env['SNIFFOUT_SYNC_TOKEN'];
    process.env['NODE_ENV'] = 'development';
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ id: AUTH_USER_ID }), { status: 200 })),
      ),
    );

    const auth = await resolveRequestAuth(
      new Request('http://localhost/api/trpc', {
        headers: { authorization: 'Bearer signed-user-jwt' },
      }),
    );

    expect(auth.userId).toBe(AUTH_USER_ID);
    expect(auth.syncAuthorized).toBe(true);
  });

  it('leaves userId null when the auth service is unreachable', async () => {
    process.env['SUPABASE_URL'] = 'https://example.supabase.co';
    process.env['SUPABASE_ANON_KEY'] = 'anon-key';
    delete process.env['SNIFFOUT_SYNC_TOKEN'];
    process.env['NODE_ENV'] = 'development';
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down'))),
    );

    const auth = await resolveRequestAuth(
      new Request('http://localhost/api/trpc', {
        headers: { authorization: 'Bearer signed-user-jwt' },
      }),
    );

    expect(auth.userId).toBeNull();
  });

  it('leaves userId null when the auth service rejects the bearer', async () => {
    process.env['SUPABASE_URL'] = 'https://example.supabase.co';
    process.env['SUPABASE_ANON_KEY'] = 'anon-key';
    process.env['SNIFFOUT_SYNC_TOKEN'] = 'lab-sync-secret';
    process.env['NODE_ENV'] = 'development';
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ message: 'bad jwt' }), { status: 401 })),
      ),
    );

    const auth = await resolveRequestAuth(
      new Request('http://localhost/api/trpc', {
        headers: { authorization: 'Bearer not-a-user' },
      }),
    );

    expect(auth.userId).toBeNull();
    expect(auth.syncAuthorized).toBe(false);
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
