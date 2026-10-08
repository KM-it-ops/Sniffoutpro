import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('organization row security migration', () => {
  it('grants scan reads to a restricted role, not only the table owner', () => {
    const sql = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../drizzle/0004_org_rls.sql'),
      'utf8',
    );
    expect(sql).toContain('CREATE ROLE sniffout_member');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('TO sniffout_member');
    expect(sql).toContain('scan_runs_org_isolation');
    expect(sql).not.toContain('TO postgres');
  });

  it('allows one membership per person in an organization', () => {
    const sql = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../drizzle/0005_membership_unique.sql'),
      'utf8',
    );
    expect(sql).toContain('memberships_org_user_unique');
    expect(sql).toContain('UNIQUE INDEX');
  });
});
