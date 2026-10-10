import { inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '@sniffoutpro/db';
import type { Tier } from '@sniffoutpro/types';
import { publicReportLogoUrl } from '../reports/store-report-logo.js';
import { createLogger } from '../logger.js';
import { appRouter } from '../router.js';
import { createCallerFactory } from '../trpc.js';
import { memberDb } from '../test-support/member-db.js';

const createCaller = createCallerFactory(appRouter);
const logger = createLogger('reports-test');
const USER = '11111111-1111-4111-8111-111111111111';
const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SCAN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CLIENT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const TEMPLATE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function reportDb(input: {
  callerOrgId: string | null;
  scanOrgId: string | null;
  clientOrgId: string | null;
  clientName: string;
}) {
  let call = 0;
  const sequenced = {
    select: () => ({
      from: () => ({
        where: () =>
          Object.assign(Promise.resolve([{ title: 'OpenSSH', severity: 'high' }]), {
            limit: () => {
              call += 1;
              if (call % 3 === 1) {
                return Promise.resolve(
                  input.callerOrgId === null ? [] : [{ orgId: input.callerOrgId, role: 'admin' }],
                );
              }
              if (call % 3 === 2) {
                return Promise.resolve([{ orgId: input.scanOrgId }]);
              }
              return Promise.resolve([{ orgId: input.clientOrgId, name: input.clientName }]);
            },
          }),
      }),
    }),
  };

  return sequenced as unknown as Database;
}

function caller(db: Database, tier: Tier) {
  return createCaller({
    db: memberDb(db),
    logger,
    userId: USER,
    tier,
    syncAuthorized: false,
  });
}

const ORIGINAL_URL = process.env['SUPABASE_URL'];
const ORIGINAL_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'];

function pdfText(pdfBase64: string): string {
  const bytes = Buffer.from(pdfBase64, 'base64');
  const start = bytes.indexOf(Buffer.from('stream\n'));
  const end = bytes.indexOf(Buffer.from('\nendstream'), start);
  return inflateSync(bytes.subarray(start + 'stream\n'.length, end)).toString('latin1');
}

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function clientDb(logoUrl: string | null) {
  let call = 0;
  return {
    select: () => ({
      from: () => ({
        where: () =>
          Object.assign(Promise.resolve([{ title: 'OpenSSH', severity: 'high' }]), {
            limit: () => {
              call += 1;
              if (call === 1) {
                return Promise.resolve([{ orgId: ORG_A, role: 'admin' }]);
              }
              if (call === 2) {
                return Promise.resolve([{ orgId: ORG_A }]);
              }
              return Promise.resolve([{ orgId: ORG_A, name: 'Acme Security', logoUrl }]);
            },
          }),
      }),
    }),
  } as unknown as Database;
}

describe('reports.download', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    if (ORIGINAL_URL === undefined) {
      delete process.env['SUPABASE_URL'];
    } else {
      process.env['SUPABASE_URL'] = ORIGINAL_URL;
    }
    if (ORIGINAL_KEY === undefined) {
      delete process.env['SUPABASE_SERVICE_ROLE_KEY'];
    } else {
      process.env['SUPABASE_SERVICE_ROLE_KEY'] = ORIGINAL_KEY;
    }
  });
  it('refuses a workstation user', async () => {
    const db = reportDb({
      callerOrgId: ORG_A,
      scanOrgId: ORG_A,
      clientOrgId: ORG_A,
      clientName: 'Acme Security',
    });
    await expect(
      caller(db, 'WORKSTATION').reports.download({ scanId: SCAN, clientId: CLIENT }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('returns a PDF containing the client name for a consultant', async () => {
    const db = reportDb({
      callerOrgId: ORG_A,
      scanOrgId: ORG_A,
      clientOrgId: ORG_A,
      clientName: 'Acme Security',
    });
    const result = await caller(db, 'CONSULTANT').reports.download({
      scanId: SCAN,
      clientId: CLIENT,
    });
    const bytes = Buffer.from(result.pdfBase64, 'base64');
    const start = bytes.indexOf(Buffer.from('stream\n'));
    const end = bytes.indexOf(Buffer.from('\nendstream'), start);
    const text = inflateSync(bytes.subarray(start + 'stream\n'.length, end)).toString('latin1');
    expect(text.toUpperCase()).toContain(
      Buffer.from('Acme Security').toString('hex').toUpperCase(),
    );
    expect(text.toUpperCase()).toContain(Buffer.from('OpenSSH').toString('hex').toUpperCase());
  });

  it('refuses a scan from another organization', async () => {
    const db = reportDb({
      callerOrgId: ORG_A,
      scanOrgId: ORG_B,
      clientOrgId: ORG_A,
      clientName: 'Acme Security',
    });
    await expect(
      caller(db, 'CONSULTANT').reports.download({ scanId: SCAN, clientId: CLIENT }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('refuses a template from another organization', async () => {
    let call = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => {
              call += 1;
              if (call === 1) {
                return Promise.resolve([{ orgId: ORG_A, role: 'admin' }]);
              }
              if (call === 2) {
                return Promise.resolve([{ orgId: ORG_A }]);
              }
              if (call === 3) {
                return Promise.resolve([{ orgId: ORG_A, name: 'Acme Security' }]);
              }
              return Promise.resolve([{ orgId: ORG_B, name: 'Other brief' }]);
            },
          }),
        }),
      }),
    } as unknown as Database;
    await expect(
      caller(db, 'CONSULTANT').reports.download({
        scanId: SCAN,
        clientId: CLIENT,
        templateId: TEMPLATE,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('embeds the logo saved on the client without a new upload', async () => {
    process.env['SUPABASE_URL'] = 'https://project.supabase.co';
    const logoUrl = publicReportLogoUrl('https://project.supabase.co', CLIENT);
    const fetchImpl = vi.fn(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () =>
          Promise.resolve(
            TINY_PNG.buffer.slice(TINY_PNG.byteOffset, TINY_PNG.byteOffset + TINY_PNG.byteLength),
          ),
      }),
    );
    vi.stubGlobal('fetch', fetchImpl);
    const result = await caller(clientDb(logoUrl), 'CONSULTANT').reports.download({
      scanId: SCAN,
      clientId: CLIENT,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(logoUrl);
    expect(Buffer.from(result.pdfBase64, 'base64').toString('latin1')).toContain('/Subtype /Image');
  });

  it('still returns a PDF when the saved logo cannot be loaded', async () => {
    process.env['SUPABASE_URL'] = 'https://project.supabase.co';
    const logoUrl = publicReportLogoUrl('https://project.supabase.co', CLIENT);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    const result = await caller(clientDb(logoUrl), 'CONSULTANT').reports.download({
      scanId: SCAN,
      clientId: CLIENT,
    });
    expect(pdfText(result.pdfBase64).toUpperCase()).toContain(
      Buffer.from('Acme Security').toString('hex').toUpperCase(),
    );
  });

  it('does not fetch a logo address outside this project', async () => {
    process.env['SUPABASE_URL'] = 'https://project.supabase.co';
    const fetchImpl = vi.fn();
    vi.stubGlobal('fetch', fetchImpl);
    const result = await caller(
      clientDb(
        'https://evil.example/storage/v1/object/public/report-logos/dddddddd-dddd-4ddd-8ddd-dddddddddddd.png',
      ),
      'CONSULTANT',
    ).reports.download({ scanId: SCAN, clientId: CLIENT });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.pdfBase64.length).toBeGreaterThan(0);
  });

  it('saves the stored logo address on the client', async () => {
    process.env['SUPABASE_URL'] = 'https://project.supabase.co';
    process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'service-role';
    const saved: string[] = [];
    const db = Object.assign(clientDb(null), {
      update: () => ({
        set: (values: { logoUrl: string }) => ({
          where: () => {
            saved.push(values.logoUrl);
            return Promise.resolve();
          },
        }),
      }),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true })),
    );
    await caller(db, 'CONSULTANT').reports.download({
      scanId: SCAN,
      clientId: CLIENT,
      logoPngBase64: TINY_PNG.toString('base64'),
    });
    expect(saved).toEqual([publicReportLogoUrl('https://project.supabase.co', CLIENT)]);
  });
});
