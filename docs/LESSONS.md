# Lessons — SniffOutPro

One entry per confirmed correction. Update in place; don't duplicate.

## 2026-07-10 — commit of audit hardening set (da9b14d)

- **lint-staged failure reverts the working tree.** With a large uncommitted
  set, a failing pre-commit hook left the tree reverted to HEAD; the only
  safety net was lint-staged's automatic backup stash (recovered via
  `git checkout 'stash@{0}' -- .`). Before committing big uncommitted work,
  either bank it with a WIP commit first or exercise the hook chain on a
  trivial change. Root cause: the hooks had never run — this was the repo's
  first real commit through them.
- **Never `git checkout --` a file that has uncommitted changes.** Used it to
  undo a drizzle-kit journal append and it silently discarded the uncommitted
  0001 entry too (restored from context). Prefer a targeted Edit/revert of the
  specific hunk.
- **Root-level eslint needs root-level resolution.** `eslint.config.js` at the
  repo root imports `@sniffoutpro/config/eslint`; that only resolves if the
  root `package.json` declares the workspace dep (pnpm isolated node_modules).
  Also mirror package-level ignores (desktop test files) at root, since
  lint-staged lints from root with the root config.
- **Hand-written Drizzle migrations need a matching snapshot.** Journal tag
  `0001_audit_hardening` existed with no `0001_snapshot.json`, so the next
  `db:generate` re-emitted all the DDL non-idempotently. Fixed by declaring
  the 14 indexes in the schema and grafting the generated snapshot as 0001.
  Residual NITs (cosmetic): snapshot records `nulls: "last"` for
  `scan_runs_started_at_idx` vs plain `DESC` in SQL (column is NOT NULL, no
  behavioral difference); journal `when` for 0001 is a hand-rounded timestamp.
- **Provenance is client-asserted.** `scanRun.source` is a labeling aid, not
  an integrity signal; `undefined` means UNVERIFIED — never default to
  'live'. Deferred follow-ups: `scan_runs.source` Postgres column (needs
  Supabase MCP), expose source on `scans.list`, shared NormalizedOutputSchema
  in @sniffoutpro/types, optional fixture-hash server heuristic.
