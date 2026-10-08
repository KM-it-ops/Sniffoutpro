import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isStoredReportLogoUrl,
  loadStoredReportLogo,
  publicReportLogoUrl,
  storeReportLogo,
} from './store-report-logo.js';

const ORIGINAL_URL = process.env['SUPABASE_URL'];
const ORIGINAL_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'];

describe('storeReportLogo', () => {
  afterEach(() => {
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

  it('does not upload when storage is not configured', async () => {
    delete process.env['SUPABASE_URL'];
    delete process.env['SUPABASE_SERVICE_ROLE_KEY'];
    await expect(storeReportLogo(new Uint8Array([1, 2, 3]), 'logo')).resolves.toBeNull();
  });

  it('does not fetch a logo stored on another host', async () => {
    process.env['SUPABASE_URL'] = 'https://project.supabase.co';
    const fetchImpl = vi.fn();
    const foreign =
      'https://evil.example/storage/v1/object/public/report-logos/dddddddd-dddd-4ddd-8ddd-dddddddddddd.png';
    await expect(loadStoredReportLogo(foreign, fetchImpl)).resolves.toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(isStoredReportLogoUrl(foreign, 'https://project.supabase.co')).toBe(false);
  });

  it('loads a logo from this project and keeps a failed fetch from breaking the caller', async () => {
    process.env['SUPABASE_URL'] = 'https://project.supabase.co';
    const logoUrl = publicReportLogoUrl(
      'https://project.supabase.co',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    );
    const png = new Uint8Array([137, 80, 78, 71]);
    const fetchImpl = vi.fn(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(png.buffer),
      }),
    );
    await expect(
      loadStoredReportLogo(logoUrl, fetchImpl as unknown as typeof fetch),
    ).resolves.toEqual(png);
    expect(fetchImpl).toHaveBeenCalledWith(logoUrl);

    const failed = vi.fn(() => Promise.reject(new Error('offline')));
    await expect(
      loadStoredReportLogo(logoUrl, failed as unknown as typeof fetch),
    ).resolves.toBeUndefined();
  });
});
