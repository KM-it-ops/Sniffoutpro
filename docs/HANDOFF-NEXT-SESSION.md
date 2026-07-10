# SniffOutPro — Handoff for Next Session (reconciled)

**Date:** 2026-07-10
**Repo:** `C:\Users\alkur\Projects\Sniffoutpro`
**Your goal:** finish workstreams **(a) spec changeset** and **(b) audit fixes** — but read §1 first: **most of both is already done and uncommitted.**

---

## 1. Reality check — read before doing anything

A parallel autonomous ("multi-agent completion") session has already executed most of (a) and (b). Verified from the working tree on 2026-07-10:

- **(a) spec changeset — DONE.** `docs/GREENFIELD-SPEC.md` is now **v2.1** (status banner, no "empty repo" framing). Prior planning doc: `docs/GREENFIELD-SPEC-v2.1-CHANGESET.md`.
- **(b) audit fixes — 11 of 15 DONE, uncommitted.** Per `docs/AUDIT-RESIDUAL-2026-07-09.md`: S1, S2, E1, S4, C1/C2, C4/C5, D1/D2, P1–P4, R1, SP1 all implemented with tests. G2b **cleared** (`verify-production.mjs` EXIT=0; `scans.sync` unauth → **401**). Prod migration `audit_hardening` applied via Supabase MCP.
- **Orchestration already exists:** `docs/MULTI-AGENT-HANDOFF.md` (Wave 0→5 plan) and `docs/HANDOFF.md` (points at it). Original findings: `docs/AUDIT-2026-07-09.md`.

### ⚠️ Top risk: all of this is UNCOMMITTED on `main`

`git log` shows **only 2 commits** (`initial commit`, one security chore). The entire hardening effort (25 modified tracked files + new untracked files: `packages/api/src/rate-limit.ts`, `packages/api/src/lockdown.test.ts`, `packages/scan-engine/src/scope/`, `packages/db/drizzle/0001_audit_hardening.sql`, several docs) is **unversioned**. One bad `git checkout`/`reset` loses it. **First recommended action: commit the hardening** (Boss-gated by the parallel session — that's you now). Stage explicit paths; never `.local/*`, `.env*`, or `scripts/inspect-db-url.mjs` output.

---

## 2. What actually remains for (a) and (b)

### Code/doc OPEN (a fresh session can finish these)

1. **C3 — fixture provenance not persisted through cloud sync.** Types + desktop now set `scanRun.source` (`packages/types/src/scan.ts`, `apps/desktop/src/lib/run-scan.ts`), but `packages/api/src/routers/scans.ts` (~line 157) drops it — `normalizedOutput` stores only hosts/findings and there's no `scan_runs.source` column. Fix: include `source` in the sync payload/`normalizedOutput`, and add an optional `source` column on `scan_runs` if list/detail UI must filter fixture vs live without JSON parsing. Add a test.
2. **Drizzle ↔ Supabase migration name alignment.** Drizzle journal tag `0001_audit_hardening` vs Supabase MCP migration name `audit_hardening` — content applied, names not aligned. Fix: document the mapping in the `0001_audit_hardening.sql` header/journal comment (no DDL change needed).

### Boss-only OPEN (you, Mahmoud — not a coding agent)

3. **Rotate the DB password** if it ever appeared in a prior chat; update Vercel `DATABASE_URL`; redeploy; smoke. (`docs/PROD-DB-TROUBLESHOOTING.md` has the steps.)
4. **Set GitHub Actions secrets** before relying on `deploy.yml`: `DATABASE_URL`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN`, `SNIFFOUT_SYNC_TOKEN`. Until then the Actions migrate/deploy path fails (not a code defect).

### Deferred by design (not part of a/b)

- **S2 lockdown flip:** public reads are currently **rate-limited `publicProcedure`**; flipping `scans.list/getDetail/diff`, `hosts.list`, `findings.list` to `protectedProcedure` is intentionally held for **Phase 4** (would break the desktop/dashboard clients until the auth UI ships). `packages/api/src/lockdown.test.ts` marks the contract.

---

## 3. Decision point for the new session

Because a/b are basically done, pick a lane and tell the agent which:

- **Lane A — Close out a/b + commit (small, ~1 session).** Finish C3 + migration-name doc, run the VERIFY-FIX LOOP, commit the whole hardening set with a Boss-approved message, optionally redeploy + smoke. Stop. _(Recommended if you just want a/b banked safely.)_
- **Lane B — Continue to Phase 4 (larger).** Do Lane A first, then follow `docs/MULTI-AGENT-HANDOFF.md` Wave 3: Supabase Auth UI, flip reads to `protectedProcedure` + update `lockdown.test.ts`, tRPC tier middleware, `scan_jobs` CRUD, desktop schedule polling, `auth.me`. Human gate before Phase 5+.

---

## 4. Constraints (Boss global instructions + this session's grants)

- **Prod authority:** deploy/migrate/push allowed **with a heads-up** — report each action; halt on anything risky. Not silent authority.
- Do **not** re-scaffold. Do **not** treat GREENFIELD §17 "empty directory" as current (v2.1 superseded it).
- Never print/commit secrets, `.env`, tokens, DB passwords. DDL via **Supabase MCP** (`user-supabase`) `apply_migration`/`execute_sql` — not Vercel env pull (`DATABASE_URL` is Sensitive).
- VERIFY-FIX LOOP after every change (typecheck → lint → test → e2e if web → cargo fmt/clippy/test if Rust). No `@ts-ignore`, `.only`, `--no-verify`, weakened asserts.
- Commit only when Boss asks (you have that ask now for the hardening set).

## 5. First commands

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
cd C:\Users\alkur\Projects\Sniffoutpro
git status --short           # confirm the uncommitted hardening is still present
pnpm install
pnpm turbo run typecheck lint test
$token = (Get-Content .local\sync-token.txt -Raw).Trim()
node scripts/verify-production.mjs https://sniffoutpro-web.vercel.app $token
```

## 6. Resume prompt (paste into the new session)

```
Continue SniffOutPro in C:\Users\alkur\Projects\Sniffoutpro.
Read first: docs/HANDOFF-NEXT-SESSION.md, docs/AUDIT-RESIDUAL-2026-07-09.md, docs/MULTI-AGENT-HANDOFF.md.
State: spec v2.1 shipped; audit hardening 11/15 done but UNCOMMITTED on main (only 2 commits exist); G2b cleared.
Do Lane A: (1) run VERIFY-FIX LOOP + verify-production to confirm green, (2) finish residual C3
(persist scanRun.source through scans.sync) and document the Drizzle 0001_audit_hardening ≡ Supabase
audit_hardening name mapping, (3) then COMMIT the full hardening set (conventional message, no secrets,
never stage .local/*). Report before any deploy. Do not start Phase 4 unless I say "continue to Phase 4."
Hard rules: no re-scaffold; DDL via Supabase MCP; VERIFY-FIX LOOP after every change.
```

## 7. Do NOT

- Re-scaffold, or reintroduce the localhost `DATABASE_URL` fallback.
- Commit `.local/*`, `.env*`, tokens, or `scripts/inspect-db-url.mjs` if it echoes a URL.
- Flip public reads → protected before the Phase-4 auth UI exists (breaks clients).
- Push or deploy without a heads-up; advance to Phase 5–7 without explicit Boss greenlight.

```

```
