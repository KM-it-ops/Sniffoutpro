# SniffOutPro — Multi-Agent Completion Handoff

> Historical. Do not spawn this swarm and do not solo from this file. The repo is `C:\AI\projects\Sniffoutpro`. Resume from `docs/HANDOFF.md`. One implementer. Paid checkout and the signed installer stay until Boss supplies Stripe and a certificate.

**Created:** 2026-07-10  
**For:** Fresh orchestrator agent — spawn subagents; do not solo the remaining product.  
**Repo:** `C:\AI\projects\Sniffoutpro`  
**In-repo mirror:** `docs/MULTI-AGENT-HANDOFF.md` (keep in sync if you edit)

---

## Mission

Finish SniffOutPro from current state (Phase 3 / G2b cleared + audit hardening shipped) through remaining hardening, review, debug, smoke, audit, commit, and **two documentation tracks**:

1. **Creator docs** — operators / maintainers / Boss (architecture, runbooks, gates, secrets, deploy).
2. **User docs** — end users of desktop + web (install, authorize scan, sync, dashboard, ethics).

Use **as many parallel subagents as safe**. Serialize only where shared mutable state or human gates require it.

---

## Absolute constraints

- Do **not** re-scaffold. Monorepo exists through Phase 3.
- Do **not** commit `.local/*`, env files, tokens, or passwords.
- Do **not** print secrets. Vercel `DATABASE_URL` is **Sensitive** — use **Supabase MCP** (`user-supabase`) for DDL.
- Do **not** run live nmap in CI.
- Governing design: `docs/GREENFIELD-SPEC.md` **v2.1** (status banner — not empty-repo).
- Execution contract: `docs/AUTONOMOUS-EXECUTION-ADDENDUM.md` (VERIFY-FIX LOOP).
- Prior audit (already largely applied): external `AUDIT-2026-07-09.md` + changeset CH-0…CH-11.
- Rotate any DB password that appeared in prior chat (Boss action if not done).

---

## Current ground truth (do not re-verify from zero)

| Fact                                 | Evidence                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| Local VERIFY                         | `pnpm turbo run typecheck lint test --force` → 29/29 EXIT=0                    |
| Prod URL                             | https://sniffoutpro-web.vercel.app                                             |
| Prod health / ping / `scans.list`    | 200 + data                                                                     |
| `scans.sync` unauthenticated         | **401** fail-closed                                                            |
| Prod migration                       | Supabase MCP `audit_hardening` applied (`org_id`, `findings.port`, indexes)    |
| Deploy                               | Vercel prod aliased; `.vercelignore` excludes desktop `target`                 |
| Branch                               | `main` — **uncommitted** audit hardening + docs (commit is a wave deliverable) |
| GitHub Actions `DATABASE_URL` secret | Missing — do not rely on `deploy.yml` migrate until Boss sets secrets          |

---

## Orchestrator protocol

You are the **Orchestrator**. You do not implement Phases 4–7 alone.

### Wave model

```
Wave 0  — Parallel read-only: audit residual + review uncommitted diff + smoke baseline
Wave 1  — Parallel writers (disjoint files): residual hardening + docs scaffolds + CI secret checklist
Wave 2  — Serialize: commit (Boss-approved message) → optional redeploy → smoke
Wave 3  — Phase 4 implementation (auth lockdown) — one primary implementer + reviewer
Wave 4  — Phase 5–7 only if Boss greenlights scope expansion; else stop after Wave 3 + docs
Wave 5  — Final: creator docs + user docs finalize, PHASE-LOG, HANDOFF update
```

### Parallelism rules

| Parallel OK                                            | Must serialize                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| Disjoint packages (`scan-engine` vs `docs` vs CI yaml) | Same file edits                                                          |
| Read-only review / audit / smoke                       | Commit + push                                                            |
| Creator doc draft vs user doc draft                    | Prod migrate / deploy                                                    |
| Desktop Rust tests vs web Playwright (local)           | Flipping `publicProcedure` → `protected` (breaks clients until UI ships) |

### Subagent roster (spawn what you need)

| ID  | Role                | Cursor `subagent_type` / skill                     | Responsibility                                           |
| --- | ------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| A0  | Residual auditor    | `explore` or `security-review` / `review-security` | Diff vs AUDIT-2026-07-09; list OPEN vs DONE              |
| R0  | Code reviewer       | `code-reviewer` / `ce-code-review`                 | Uncommitted hardening PR-quality review                  |
| S0  | Smoke runner        | `shell`                                            | `verify-production.mjs` + local VERIFY; paste exit codes |
| H1  | Hardening finisher  | `implement` / `generalPurpose`                     | Close residual MED/LOW from A0 (only allowed_files)      |
| C1  | Committer           | `shell` + commit skill                             | Stage safe files; conventional commit; **no secrets**    |
| D1  | Creator docs        | `docs-architect` / `generalPurpose`                | `docs/CREATOR.md` (or `docs/ops/*`)                      |
| D2  | User docs           | `tutorial-engineer` / `generalPurpose`             | `docs/USER-GUIDE.md`                                     |
| P4  | Phase 4 implementer | `implement` + supabase skill                       | Auth UI + protectedProcedure + schedules                 |
| P4R | Phase 4 reviewer    | `code-reviewer`                                    | Auth/security review before deploy                       |
| Q1  | QA / Playwright     | `qa` / `playwright` / `test-automator`             | E2E after P4                                             |
| X1  | CI babysitter       | `ci-watcher`                                       | After push: watch CI green                               |

**Suggested skills to invoke:** `autonomous-execution`, `handoff` (already used), `supabase` / `supabase-postgres-best-practices`, `review-security`, `ce-commit` (only when Boss asks to commit), `verify-this`, `graphify` (after code edits).

---

## Wave 0 — Kickoff (parallel, read-only)

Spawn **A0 + R0 + S0** together.

### A0 — Residual audit checklist

Mark each DONE / OPEN / N/A with file evidence:

- [ ] S1 fail-closed sync auth
- [ ] S2 rate limits + lockdown test (Phase 4 still must flip protected)
- [ ] E1 `validateScanScope` + UI overrides
- [ ] S4 Rust `--` + target allowlist
- [ ] C1/C2 correlation semver/tokens
- [ ] C3 fixture provenance
- [ ] C4/C5 port + banner/product
- [ ] D1/D2 indexes + org_id (prod MCP applied)
- [ ] P1–P4 CI (boundaries, rust, coverage, smoke in deploy.yml)
- [ ] R1 web graph `ssr:false`
- [ ] SP1 NVD 2.0 stub
- [ ] Password rotation (Boss)
- [ ] GitHub `DATABASE_URL` / Vercel deploy secrets for Actions
- [ ] Drizzle journal vs Supabase migration name sync

Output: `docs/AUDIT-RESIDUAL-YYYY-MM-DD.md` (short table only).

### R0 — Review uncommitted tree

Focus: auth, Rust spawn, migrations, CI. Taxonomy: Critical / Should Fix / Consider. No drive-by refactors.

### S0 — Baseline smoke

```powershell
pnpm turbo run typecheck lint test
$token = (Get-Content .local\sync-token.txt -Raw).Trim()
node scripts/verify-production.mjs https://sniffoutpro-web.vercel.app $token
```

Record exits in `docs/PHASE-LOG.md`.

**Gate W0:** A0+R0+S0 receipts in. Orchestrator merges OPEN list → Wave 1 tasking.

---

## Wave 1 — Residual hardening + doc scaffolds (parallel writers)

Spawn **H1 + D1 + D2** with **disjoint paths**:

| Agent | Allowed paths                                                                                |
| ----- | -------------------------------------------------------------------------------------------- |
| H1    | Only files named in A0 OPEN list (prefer packages/_, apps/_, .github/\*)                     |
| D1    | `docs/CREATOR.md`, `docs/ops/**`, update `docs/PRODUCTION.md` / `PROD-DB-TROUBLESHOOTING.md` |
| D2    | `docs/USER-GUIDE.md`, optionally `docs/DEMO-G2.md` refresh                                   |

H1 VERIFY after edits: `pnpm turbo run typecheck lint test` (affected filters OK).

**Creator doc must include:** monorepo map, env var table (names only), migrate via Supabase MCP, Vercel deploy + `.vercelignore`, VERIFY commands, gate checklist G1–G6, secret rotation, known Sensitive-env limitation.

**User doc must include:** what SniffOutPro is / is not, install desktop, consent + private-range override, fixture vs live, sync to dashboard, reading topology/findings, ethics (“authorized targets only”), troubleshooting (nmap missing, sync 401).

**Gate W1:** H1 green VERIFY; D1+D2 drafts exist; no secrets in docs.

---

## Wave 2 — Commit + optional ship (serialize)

1. Ask Boss: “Commit audit hardening + docs now?” If no → skip commit, continue Wave 3 on dirty tree carefully.
2. If yes → **C1** only:
   - Stage explicit paths (never `.local`, never env).
   - Message style: conventional, why-focused (see recent `git log`).
   - Do not push unless Boss asks.
3. If Boss wants prod refresh after commit: deploy with `vercel deploy --prod --yes --scope km-it-ops-projects` (respect `.vercelignore`); smoke via S0.
4. DDL only via Supabase MCP `apply_migration` / `execute_sql`.

**Gate W2:** Clean commit receipt OR explicit Boss deferral noted in HANDOFF.

---

## Wave 3 — Phase 4 (auth + schedules) — primary product remaining

Spawn **P4** then **P4R** then **Q1**.

### P4 deliverables (GREENFIELD §14 Phase 4)

- Supabase Auth UI (sign up / login / logout) on web
- Flip `scans.list|getDetail|diff`, `hosts.list`, `findings.list` → `protectedProcedure` (update `lockdown.test.ts` to assert UNAUTHORIZED)
- Tier middleware on tRPC
- `scan_jobs` CRUD
- Desktop schedule polling (stored consent policy)
- `auth.me` returns user + tier
- Stop shipping shared `VITE_SYNC_TOKEN` as long-term write path (JWT preferred; document interim)

### P4R

Security review: session handling, RLS readiness, no fail-open regressions.

### Q1

Playwright + desktop fixture path; prod smoke after deploy.

**Gate W3 / Phase 4 pass:** Unauthenticated cannot call protected routes or `auth.me`; schedules create/list; VERIFY + smoke green.

**Human gate:** Do not start Phase 5–7 without Boss saying “continue to CONSULTANT/ADMIN/ship”.

---

## Wave 4 — Optional Phases 5–7 (Boss-gated)

Only if Boss expands scope. One phase per wave; same implement → review → QA → smoke pattern.

- Phase 5 CONSULTANT / G3 — branded PDF reports
- Phase 6 ADMIN / G4 — orgs + RLS
- Phase 7 G5+G6 — commercial, signed installers, public docs site

Prefer separate feature branches per phase if committing.

---

## Wave 5 — Finalize documentation + handoff

Spawn **D1 + D2** (finalize) + Orchestrator updates:

- [ ] `docs/CREATOR.md` complete (ops-ready)
- [ ] `docs/USER-GUIDE.md` complete (end-user-ready)
- [ ] `docs/PHASE-LOG.md` updated with wave exits
- [ ] `docs/HANDOFF.md` points to next phase / stop
- [ ] Residual audit closed or explicitly deferred
- [ ] `graphify update .` if available after code changes

**Definition of done for this handoff (minimum without Phase 5–7):**

1. Residual audit closed or ticketed
2. Uncommitted hardening committed (or Boss deferred)
3. Creator + User docs published in `docs/`
4. Phase 4 complete **or** explicitly deferred with reason
5. Prod smoke still green
6. Fresh `docs/HANDOFF.md` for the following session

---

## Kickoff prompt (paste into new chat)

```
You are the Orchestrator for SniffOutPro multi-agent completion.

Read:
- docs/MULTI-AGENT-HANDOFF.md (or %TEMP%\sniffoutpro-multi-agent-handoff.md)
- docs/HANDOFF.md
- docs/GREENFIELD-SPEC.md v2.1 (status banner — do not re-scaffold)
- docs/AUTONOMOUS-EXECUTION-ADDENDUM.md

Mission: spawn subagents per Wave 0→5. Parallelize Wave 0 now (A0 residual audit, R0 code review, S0 smoke). Then Wave 1 residual hardening + creator/user doc scaffolds. Commit only when Boss asks. Phase 4 after Wave 1–2. Stop before Phase 5 unless Boss expands scope.

Hard rules: no re-scaffold; no secrets in git; Supabase MCP for DDL; VERIFY-FIX LOOP; two doc tracks (CREATOR + USER-GUIDE).

Start Wave 0 immediately. Report a wave board after each wave.
```

---

## Tools & credentials map

| Need         | How                                                            |
| ------------ | -------------------------------------------------------------- |
| Prod DDL     | MCP `user-supabase` → `apply_migration` / `execute_sql`        |
| Prod smoke   | `scripts/verify-production.mjs` + `.local/sync-token.txt`      |
| Deploy       | `vercel deploy --prod --yes --scope km-it-ops-projects`        |
| Project      | Vercel `sniffoutpro-web` / Supabase ref `nwzcfwduwddkkvqlbfqo` |
| Local VERIFY | `pnpm turbo run typecheck lint test`                           |

---

## Anti-patterns

- One agent implementing Phase 4–7 sequentially without reviews
- Committing without Boss ask
- Redeploying before migration when schema changes
- Treating GREENFIELD §17 empty-directory text as current (v2.1 superseded)
- Mixing creator ops runbooks into user-facing guide

---

_End multi-agent handoff._
