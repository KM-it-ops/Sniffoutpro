# AUDIT Residual — 2026-07-09 (A0 / Wave 0)

Diff vs AUDIT-2026-07-09 + CH-0…CH-11 / MULTI-AGENT-HANDOFF Wave 0 checklist. Read-only; no code changes.

| ID                      | Status | Evidence                                                                                                                                                                                                                                        |
| ----------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1                      | DONE   | `packages/api/src/auth/resolve-request-auth.ts:68-74` — prod fail-closed when `SNIFFOUT_SYNC_TOKEN` unset/empty; tests `resolve-request-auth.test.ts:42-56`, `sync-auth-prod.test.ts:14-39`; `lockdown.test.ts:25-48` sync UNAUTHORIZED         |
| S2                      | DONE   | `packages/api/src/rate-limit.ts:23-41` + wired on `scans.ts:102-106`, `hosts.ts:13-16`, `findings.ts:12-15`; `lockdown.test.ts:10-23` contract marker. **Note:** Phase 4 must still flip `publicProcedure` → `protectedProcedure` (Wave 3 / P4) |
| E1                      | DONE   | `packages/scan-engine/src/scope/validate-scan-scope.ts:115+`; desktop `run-scan.ts:59-60`; UI override `apps/desktop/src/App.tsx:271-283`                                                                                                       |
| S4                      | DONE   | `apps/desktop/src-tauri/src/lib.rs:42-114` target allowlist; `128-129` `--` before targets; tests `179+`                                                                                                                                        |
| C1/C2                   | DONE   | `packages/scan-engine/src/cve/correlate.ts:31-56` whole-token match; `68-78` semver `compareVersions`; tests `correlate.test.ts:73-117`                                                                                                         |
| C3                      | OPEN   | Types+desktop set `source`: `packages/types/src/scan.ts:47-60`, `run-scan.ts:93-199`. Cloud sync drops it: `packages/api/src/routers/scans.ts:157` (`normalizedOutput` hosts/findings only); no `scan_runs.source` column                       |
| C4/C5                   | DONE   | `findings.port` schema `packages/db/src/schema/index.ts:117-118` + migrate `0001_audit_hardening.sql:5`; sync writes port `scans.ts:224`; banner≠name `parse-xml.ts:88-100`                                                                     |
| D1/D2                   | DONE   | Indexes+`org_id` in `packages/db/drizzle/0001_audit_hardening.sql:1-34` + schema; prod MCP applied per `docs/PHASE-LOG.md:82`                                                                                                                   |
| P1–P4                   | DONE   | P1 boundaries `ci.yml:64-77` + `packages/config/eslint.config.js`; P2 rust `ci.yml:79-94`; P3 coverage `ci.yml:55-56`; P4 smoke `deploy.yml:73-77`                                                                                              |
| R1                      | DONE   | `apps/web/src/components/dashboard-client.tsx:8-11` — `TopologyGraph` `dynamic(..., { ssr: false })`                                                                                                                                            |
| SP1                     | DONE   | `packages/api/src/jobs/cve-sync.ts:24-55` — NVD 2.0 base URL + incremental URL builder + stub handler                                                                                                                                           |
| Password rotation       | OPEN   | Boss — `docs/MULTI-AGENT-HANDOFF.md:30`, `docs/BLOCKER-2026-07-09.md:50`; no code evidence of completed rotation                                                                                                                                |
| GitHub Actions secrets  | OPEN   | Boss — `deploy.yml:49` needs `secrets.DATABASE_URL`; `66-70` Vercel tokens; handoff states DATABASE_URL secret missing (`MULTI-AGENT-HANDOFF.md:45`)                                                                                            |
| Drizzle ↔ Supabase name | OPEN   | Journal tag `0001_audit_hardening` (`drizzle/meta/_journal.json:16`) vs MCP name `audit_hardening` (`PHASE-LOG.md:82`); content applied, names not aligned                                                                                      |

**Counts:** DONE **11** · OPEN **4** · N/A **0**

## OPEN for Wave 1 (H1)

- **C3** — Persist fixture provenance through cloud sync: include `scanRun.source` in `packages/api/src/routers/scans.ts` `normalizedOutput` (and surface on list/detail if product needs it). Prefer also adding optional `source` on Postgres `scan_runs` if list UI must filter fixture vs live without parsing JSON.
- **Drizzle ↔ Supabase name** — Document mapping in `packages/db/drizzle/0001_audit_hardening.sql` header (and/or journal comment): Drizzle `0001_audit_hardening` ≡ Supabase MCP `audit_hardening`. No DDL change required if prod already applied.

## Boss-only OPEN

- **Password rotation** — Rotate any DB password that appeared in prior chat; update Vercel `DATABASE_URL`; redeploy; smoke.
- **GitHub Actions secrets** — Set `DATABASE_URL`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN`, `SNIFFOUT_SYNC_TOKEN` (and `PRODUCTION_URL` var if needed) before relying on `deploy.yml` migrate/deploy/smoke.

## Critical gaps

- None in shipped audit hardening code for S1/S4/E1 (fail-closed sync, Rust spawn, scope).
- **Operational:** Actions migrate/deploy path will fail until Boss sets GitHub secrets (not a code defect).
- **Known deferred (not Wave 1):** public reads remain rate-limited `publicProcedure` until Phase 4 — tracked under S2 note / Wave 3.
