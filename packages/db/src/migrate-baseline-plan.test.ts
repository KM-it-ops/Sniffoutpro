import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  type CatalogSnapshot,
  type JournalEntry,
  planBaseline,
  requiredObjects,
} from '../../../scripts/migrate-baseline-plan.mjs';

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), '../drizzle');
const journal = JSON.parse(readFileSync(join(drizzleDir, 'meta/_journal.json'), 'utf8')) as {
  entries: JournalEntry[];
};
const sqlByTag = new Map(
  journal.entries.map((e) => [e.tag, readFileSync(join(drizzleDir, `${e.tag}.sql`), 'utf8')]),
);

function whenOf(tag: string): number {
  const entry = journal.entries.find((e) => e.tag === tag);
  if (!entry) throw new Error(`no journal entry ${tag}`);
  return entry.when;
}

function sqlOf(tag: string): string {
  const text = sqlByTag.get(tag);
  if (text === undefined) throw new Error(`no SQL for ${tag}`);
  return text;
}

/** A database where every object the given migrations create exists. */
function catalogWith(tags: readonly string[], drop: readonly string[] = []): CatalogSnapshot {
  const all = tags.map((tag) => requiredObjects(sqlOf(tag)));
  const keep = (names: readonly string[]) => new Set(names.filter((n) => !drop.includes(n)));
  return {
    tables: keep(all.flatMap((r) => r.tables)),
    columns: keep(all.flatMap((r) => r.columns)),
    constraints: keep(all.flatMap((r) => r.constraints)),
    indexes: keep(all.flatMap((r) => r.indexes)),
  };
}

function plan(catalog: CatalogSnapshot, ledgerHighWater: number | null = null) {
  return planBaseline({ entries: journal.entries, sqlByTag, ledgerHighWater, catalog });
}

const recorded = (decisions: ReturnType<typeof plan>) =>
  decisions.filter((d) => d.record).map((d) => d.tag);

const allTags = journal.entries.map((e) => e.tag);
const lastTag = allTags.at(-1) ?? '';

describe('migrate-baseline plan', () => {
  it('records only 0000 and 0001 even when every later migration was applied by hand', () => {
    const decisions = plan(catalogWith(allTags));
    expect(recorded(decisions)).toEqual(['0000_modern_zodiak', '0001_audit_hardening']);
    expect(decisions.find((d) => d.tag === '0005_membership_unique')).toMatchObject({
      record: false,
    });
  });

  it('never records 0005 when its unique index is missing', () => {
    const decisions = plan(catalogWith(allTags, ['memberships_org_user_unique']));
    expect(recorded(decisions)).not.toContain('0005_membership_unique');
    expect(decisions.map((d) => d.tag)).toEqual(allTags);
  });

  it('records nothing on a fresh database', () => {
    const empty = catalogWith([]);
    expect(recorded(plan(empty))).toEqual([]);
  });

  it('records nothing when 0000 is only partly there, and names what is missing', () => {
    const decisions = plan(catalogWith(['0000_modern_zodiak', '0001_audit_hardening'], ['users']));
    expect(recorded(decisions)).toEqual([]);
    expect(decisions[0]?.reason).toContain('tables:users');
  });

  it('records 0000 but leaves 0001 when one of its indexes is missing', () => {
    const decisions = plan(
      catalogWith(['0000_modern_zodiak', '0001_audit_hardening'], ['scan_runs_org_id_idx']),
    );
    expect(recorded(decisions)).toEqual(['0000_modern_zodiak']);
    expect(decisions[1]?.reason).toContain('indexes:scan_runs_org_id_idx');
  });

  it('does not record 0001 past an unrecorded 0000 (drizzle-kit would skip the gap)', () => {
    const decisions = plan(
      catalogWith(
        ['0000_modern_zodiak', '0001_audit_hardening'],
        ['findings_cve_id_cve_cache_id_fk'],
      ),
    );
    expect(recorded(decisions)).toEqual([]);
    expect(decisions[1]).toMatchObject({
      tag: '0001_audit_hardening',
      reason: 'an earlier entry is left for drizzle-kit',
    });
  });

  it('is idempotent: once the ledger reaches 0001 it records nothing more', () => {
    const decisions = plan(catalogWith(allTags), whenOf('0001_audit_hardening'));
    expect(recorded(decisions)).toEqual([]);
    expect(decisions.map((d) => d.tag)).toEqual(allTags.slice(allTags.indexOf('0002_user_tier')));
  });

  it('only adds what is newer than the ledger, never rows drizzle-kit already skips', () => {
    const fromZero = plan(catalogWith(allTags), whenOf('0000_modern_zodiak'));
    expect(recorded(fromZero)).toEqual(['0001_audit_hardening']);
    expect(plan(catalogWith(allTags), whenOf(lastTag))).toEqual([]);
  });

  it('checks every table and constraint 0000 creates', () => {
    const required = requiredObjects(sqlOf('0000_modern_zodiak'));
    expect(required.tables).toHaveLength(15);
    expect(required.constraints).toHaveLength(20);
    expect(required.constraints).toContain('users_email_unique');
    expect(required.constraints).toContain('ssl_certificates_host_id_hosts_id_fk');
  });

  it('checks every column, constraint and index 0001 creates', () => {
    const required = requiredObjects(sqlOf('0001_audit_hardening'));
    expect(required.columns).toEqual([
      'hosts.org_id',
      'services.org_id',
      'findings.org_id',
      'findings.port',
    ]);
    expect(required.constraints).toHaveLength(3);
    expect(required.indexes).toHaveLength(14);
  });
});
