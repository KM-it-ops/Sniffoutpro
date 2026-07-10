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
- **Desktop bundling: keep Node-only clients out of the browser graph.**
  `@sniffoutpro/db`'s root export pulls the `postgres` client into the desktop
  vite build, which rollup cannot bundle (pre-existing breakage — the
  VERIFY-FIX loop never gated on `build`). Fixed with a vite alias to a
  throwing stub (`postgres-browser-stub.ts`); the durable fix is splitting the
  db package's exports so desktop imports only the sqlite subpath. `build` is
  now part of the verify gate.
- **Rust/Tauri glib alert (GHSA, glib <0.20) is not locally fixable.** glib
  0.18.5 is pinned by Tauri 2's GTK stack; Linux-only code path. Revisit on
  the next Tauri minor that bumps gtk-rs.
- **PowerShell pipes add a BOM when feeding secrets to native CLIs.**
  `$value | gh secret set NAME` stored secrets with a leading U+FEFF, which
  Vercel rejected ("Must not contain"). Write the value with
  `[IO.File]::WriteAllText($tmp, $v, UTF8Encoding($false))` and redirect via
  `cmd /c "gh secret set NAME < file"` instead.
- **Vercel CLI session tokens are not API tokens.** The token in the CLI's
  auth.json cannot be used with `vercel --token` or to mint access tokens via
  the API (403). A CI `VERCEL_TOKEN` must be created manually in the Vercel
  dashboard (Account Settings → Tokens).
- **CI failures came in layers, each hiding the next:** pnpm action-setup
  version conflict → typed-lint against unbuilt workspace dist → glib-sys
  needing GTK system packages → Playwright babel choking on `export * as` →
  e2e needing a Postgres service. Fixing CI on a repo whose hooks/workflows
  never ran green means budgeting for several iterations, not one.
- **Provenance is client-asserted.** `scanRun.source` is a labeling aid, not
  an integrity signal; `undefined` means UNVERIFIED — never default to
  'live'. Deferred follow-ups: `scan_runs.source` Postgres column (needs
  Supabase MCP), expose source on `scans.list`, shared NormalizedOutputSchema
  in @sniffoutpro/types, optional fixture-hash server heuristic.
