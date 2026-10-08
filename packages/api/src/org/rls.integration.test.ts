import { sql } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '@sniffoutpro/db';

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

describe('sniffout_member row security', () => {
  const db = createDb(DATABASE_URL);
  let ready = false;

  beforeAll(async () => {
    try {
      await db.execute(sql`select 1`);
      ready = true;
    } catch {
      ready = false;
    }
  });

  it('cannot read another organization when the session is the restricted role', async (ctx) => {
    if (!ready) {
      ctx.skip();
    }
    const migration = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../../db/drizzle/0004_org_rls.sql'),
      'utf8',
    );
    for (const statement of migration.split('--> statement-breakpoint')) {
      const text = statement.trim();
      if (text.length > 0) {
        await db.execute(sql.raw(text));
      }
    }

    const orgA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const orgB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const scopeId = '11111111-1111-4111-8111-111111111111';
    const scanA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const scanB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await db.execute(sql`
      insert into organizations (id, name, slug)
      values (${orgA}::uuid, 'Org A', 'org-a-rls'), (${orgB}::uuid, 'Org B', 'org-b-rls')
      on conflict (id) do nothing
    `);
    await db.execute(sql`
      insert into authorization_scopes (id, targets, consent_text, consented_at)
      values (${scopeId}::uuid, '["127.0.0.1"]'::jsonb, 'lab consent', now())
      on conflict (id) do nothing
    `);
    await db.execute(sql`
      insert into scan_runs (id, org_id, authorization_scope_id, status, targets, intensity)
      values
        (${scanA}::uuid, ${orgA}::uuid, ${scopeId}::uuid, 'completed', '["127.0.0.1"]'::jsonb, 'light'),
        (${scanB}::uuid, ${orgB}::uuid, ${scopeId}::uuid, 'completed', '["10.0.0.1"]'::jsonb, 'light')
      on conflict (id) do nothing
    `);

    const owned = await db.execute(sql`
      select id::text as id, org_id::text as org_id from scan_runs
      where id in (${scanA}::uuid, ${scanB}::uuid)
    `);
    const ownedIds = scanIds(owned);
    expect(ownedIds).toContain(scanA);
    expect(ownedIds).toContain(scanB);

    const visible = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role sniffout_member`);
      await tx.execute(sql`select set_config('sniffout.org_id', ${orgA}, true)`);
      return tx.execute(sql`
        select id::text as id, org_id::text as org_id from scan_runs
        where id in (${scanA}::uuid, ${scanB}::uuid)
      `);
    });
    const visibleIds = scanIds(visible);
    expect(visibleIds).toContain(scanA);
    expect(visibleIds).not.toContain(scanB);
  });
});

function scanIds(result: unknown): string[] {
  if (!Array.isArray(result)) {
    throw new Error('Expected scan rows');
  }
  return result.map((row) => {
    const id = (row as { id?: unknown }).id;
    if (typeof id !== 'string') {
      throw new Error('Expected a scan id');
    }
    return id;
  });
}
