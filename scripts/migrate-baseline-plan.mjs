/**
 * Decides which journal entries scripts/migrate-baseline.mjs may record in
 * drizzle.__drizzle_migrations. Pure (no I/O) so it can be unit tested — see
 * packages/db/src/migrate-baseline-plan.test.ts.
 *
 * drizzle-kit reads only the newest ledger row and runs every journal entry
 * after it. So a recorded entry must really be applied, and nothing may be
 * recorded past an entry that is not: that would make drizzle-kit skip the gap.
 */

/**
 * Migrations applied to prod before the ledger existed: 0000 via early tooling,
 * 0001 via the Supabase MCP as 'audit_hardening'. Anything else, including
 * DDL applied by hand later, is left for drizzle-kit to apply or fail on.
 */
export const PRE_LEDGER_TAGS = ['0000_modern_zodiak', '0001_audit_hardening'];

/** The tables, columns, constraints and indexes a migration file creates. */
export function requiredObjects(sqlText) {
  const collect = (pattern, format) => [
    ...new Set([...sqlText.matchAll(pattern)].map(format)),
  ];
  return {
    tables: collect(/CREATE TABLE (?:IF NOT EXISTS )?"(\w+)"/g, (m) => m[1]),
    columns: collect(
      /ALTER TABLE "(\w+)" ADD COLUMN (?:IF NOT EXISTS )?"(\w+)"/g,
      (m) => `${m[1]}.${m[2]}`,
    ),
    constraints: collect(/CONSTRAINT "(\w+)"/g, (m) => m[1]),
    indexes: collect(/CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?"(\w+)"/g, (m) => m[1]),
  };
}

function missingObjects(required, catalog) {
  return Object.entries(required).flatMap(([kind, names]) =>
    names.filter((name) => !catalog[kind].has(name)).map((name) => `${kind}:${name}`),
  );
}

/**
 * One decision per journal entry newer than the ledger's newest row, in
 * journal order. Entries at or below that row are already skipped by
 * drizzle-kit, so they get no decision.
 */
export function planBaseline({ entries, sqlByTag, ledgerHighWater, catalog }) {
  const decisions = [];
  let blocked = false;
  for (const { tag, when } of entries) {
    if (ledgerHighWater !== null && when <= ledgerHighWater) continue;
    const leave = (reason) => {
      blocked = true;
      decisions.push({ tag, when, record: false, reason });
    };
    if (blocked) {
      decisions.push({ tag, when, record: false, reason: 'an earlier entry is left for drizzle-kit' });
      continue;
    }
    if (!PRE_LEDGER_TAGS.includes(tag)) {
      leave('not a pre-ledger migration');
      continue;
    }
    const sqlText = sqlByTag.get(tag);
    const required = requiredObjects(sqlText ?? '');
    const total = Object.values(required).reduce((n, names) => n + names.length, 0);
    if (total === 0) {
      leave('no checkable DDL found');
      continue;
    }
    const missing = missingObjects(required, catalog);
    if (missing.length > 0) {
      leave(`${String(missing.length)} of ${String(total)} objects missing: ${missing.join(', ')}`);
      continue;
    }
    decisions.push({ tag, when, record: true, reason: `all ${String(total)} objects present` });
  }
  return decisions;
}
