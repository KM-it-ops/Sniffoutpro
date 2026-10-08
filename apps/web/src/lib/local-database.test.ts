import { describe, expect, it } from 'vitest';
import { LOCAL_DATABASE_URL, shouldProvisionLocalDatabase } from './local-database.js';

describe('shouldProvisionLocalDatabase', () => {
  it('creates the local database when no connection string is set', () => {
    expect(shouldProvisionLocalDatabase({ NODE_ENV: 'development' })).toBe(true);
  });

  it('creates the local database when the connection string is the local default', () => {
    expect(
      shouldProvisionLocalDatabase({ NODE_ENV: 'development', DATABASE_URL: LOCAL_DATABASE_URL }),
    ).toBe(true);
  });

  it('leaves a Supabase connection string alone', () => {
    expect(
      shouldProvisionLocalDatabase({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://postgres.example:secret@db.example:5432/postgres',
      }),
    ).toBe(false);
  });

  it('does not create a database for production, Vercel, or tests', () => {
    expect(shouldProvisionLocalDatabase({ NODE_ENV: 'production' })).toBe(false);
    expect(shouldProvisionLocalDatabase({ NODE_ENV: 'development', VERCEL: '1' })).toBe(false);
    expect(shouldProvisionLocalDatabase({ NODE_ENV: 'test' })).toBe(false);
  });
});
