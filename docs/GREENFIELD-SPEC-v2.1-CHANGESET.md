# SniffOutPro — Spec Improvement Changeset (v2.0 → v2.1)

**Prepared:** 2026-07-09
**Applies to:** `docs/GREENFIELD-SPEC.md` (v2.0)
**Status:** Proposed — not yet applied. Presented for your review before any edit.

This is a _changeset_, not a rewrite. The v2.0 spec is strong; these edits fix one dangerous framing contradiction, refresh two facts that have gone stale, and close the gaps the Phase 0–3 audit surfaced (see `AUDIT-2026-07-09.md`). Each item lists **where**, **change**, and **why**.

---

## CH-0 — Reconcile "greenfield/empty repo" framing with reality (highest priority)

**Where:** Header ("Build the complete product from an empty repository… Do not assume any prior codebase"), §14 phase gates, §17 ("Start state: Empty directory").

**Change:** Add a **Status banner** at the top and reframe §17:

> **Current state (2026-07):** This product is **already built through Phase 3** (Gate G2b) — a live pnpm+Turbo monorepo deployed to Vercel + Supabase, 29/29 tests green. This document is the _design source of truth_, **not** a signal to re-scaffold. For resume/execution, `docs/HANDOFF.md` + `docs/AUTONOMOUS-EXECUTION-ADDENDUM.md` are authoritative. Treat §§1–13 as the target design and §14 gates as a _checklist of what is done vs. remaining_, not a from-scratch build order.

Mark G1, G2, and G2b as **DONE** inline; keep Phases 4–7 as the remaining work.

**Why:** The v2.0 header and §17 tell a fresh agent to start from an empty directory and "supersede all other specs." That directly contradicts `HANDOFF.md`'s "Do **not** re-scaffold." An agent reading only the spec would clobber Phases 0–3. This single contradiction is the most dangerous thing in the document.

---

## CH-1 — §8.2 Auth: make production fail **closed**

**Change:** Add a hard rule: _In production (`VERCEL` or `NODE_ENV=production`), if there is no valid JWT and `SNIFFOUT_SYNC_TOKEN` is unset or empty, `syncAuthorized` MUST be `false`._ Mirror the pattern `apps/web/src/lib/db.ts` already uses for `DATABASE_URL`. Add a startup assertion that logs and refuses to treat sync as open in production.

**Why:** Current code (`resolve-request-auth.ts`) treats "no token configured" as "everyone authorized" — fail-open — with no production guard (audit **S1**). The spec says sync must be rejected without a token, but doesn't state the fail-closed rule explicitly, so the implementation drifted.

## CH-2 — §8.1 Endpoints: turn the "public\*" footnote into a tracked lockdown gate

**Change:** (1) Move `hosts.listByScan` and `findings.listByScan` to **protected now** (the table already says protected; code ships them public). (2) Replace the "may be public in v1" footnote with an explicit **pre-G6 lockdown checklist** plus a required regression test: _"Assert `scans.list/getDetail/diff` reject unauthenticated requests in production once auth is wired."_ (3) Add: until Phase 4, document the deployment as single-tenant and apply a rate limit to public reads.

**Why:** In production these endpoints currently return real host/finding data unauthenticated (audit **S2**, confirmed by live probe). An untracked footnote is not a control.

## CH-3 — §6.5 Guardrails: mark as unmet acceptance criteria + add test hooks

**Change:** Keep the six guardrails, but annotate #3–#5 (max CIDR `/16`, max job-size modal, private/reserved-range block+override) as **NOT YET IMPLEMENTED — required for G2 re-certification.** Specify a shared `validateScanScope(targets, opts)` in `@sniffoutpro/scan-engine` with unit tests, consumed by the desktop UI **and** re-validated at the Rust boundary.

**Why:** Only consent (#1–2) is enforced today (audit **E1**). The spec presents all six as done-by-Phase-2; they are not.

## CH-4 — §6.2 nmap execution: validate targets at the privilege boundary

**Change:** Add: _"The Rust `run_nmap` command MUST NOT trust the renderer. It validates `targets` against an IP/CIDR/hostname allowlist, rejects any argument beginning with `-`, and inserts a literal `--` before targets so nmap stops option parsing. Scope guardrails are enforced in TypeScript **and** re-checked in Rust (defense in depth)."_

**Why:** `targets` currently reaches nmap as an unvalidated arg with no `--` terminator → nmap argument injection (NSE scripts, file writes) if the TS guardrails are ever bypassed (audit **S4**). The privilege boundary must not rely solely on the UI layer.

## CH-5 — §6.3 Correlation: specify version + product matching semantics

**Change:** Require (1) **semver-aware** version-range comparison (not string `<`/`>`); (2) tokenized/exact product+vendor matching rather than bidirectional substring; (3) once on NVD 2.0, prefer **CPE match strings** (`versionStartIncluding`/`versionEndExcluding`).

**Why:** Current lexicographic comparison mis-orders versions (`"9">"10"`) and bidirectional substring over-matches (`"ssh"⊃"sh"`) → false positives/negatives (audit **C1/C2**). A vuln scanner's credibility depends on precision.

## CH-6 — §10 Background jobs: NVD **2.0 API**, not legacy feeds

**Change:** Replace "Fetch NVD JSON feeds" with: _"Fetch from the **NVD 2.0 REST API** using an `NVD_API_KEY`, incremental `lastModStartDate`/`lastModEndDate` windows (≤120 days), paginated `resultsPerPage`/`startIndex`, and rate-limit backoff (50 req/30s with key). Persist `last_synced_at` as the incremental cursor."_

**Why:** NIST is retiring the legacy data feeds (1.0 API already retired) in favor of the 2.0 API. Building against the feeds ships a job that breaks on NVD's schedule (audit **SP1**).

## CH-7 — §7.1 Data model: indexes, RLS-readiness, auth mapping

**Change:** (1) The initial (or a follow-up) migration MUST create indexes on every FK (`hosts.scan_run_id`, `services.host_id`, `findings.scan_run_id`, `findings.host_id`, `findings.service_id`) and on `scan_runs(started_at DESC)`. (2) Add `org_id` to `hosts`, `services`, `findings` (or specify join-based RLS) so Phase-6 ADMIN isolation doesn't require a large backfill. (3) State the `Supabase auth.users → public.users` mapping and which is source of truth. (4) Add `port` to `findings` so `Finding.port` round-trips (it currently doesn't, weakening `scans.diff`).

**Why:** Migration `0000` has zero indexes — contradicting the repo's own bundled Postgres best-practices skill (audit **D1**); leaf tables have no tenancy column (**D2**); `users` duplicates Supabase auth (**D3**); `finding.port` is dropped on sync (**C4**).

## CH-8 — §11 Security: add the controls the incident history implies

**Change:** Add rows/subsections for: (1) **Secret-rotation runbook** — steps to rotate the Supabase DB password and `SNIFFOUT_SYNC_TOKEN` and update Vercel, since the production blocker was a rotated/exposed DB credential. (2) **Error tracking** (e.g. Sentry) on web + API. (3) **Rate limiting** on public/unauthed tRPC reads. (4) **Constant-time** token comparison. (5) A note that the desktop-embedded sync token is a shared secret unsuitable for multi-customer distribution — replace with per-user JWT at Phase 4.

**Why:** The spec has a good security table but no rotation procedure (the exact class of the recurring blocker), no observability, no rate limiting, and no acknowledgement of the shared-token distribution problem (audit **S3/S5**).

## CH-9 — §12.4 CI/CD: make the claimed controls real + add gates

**Change:** (1) Wire `eslint-plugin-boundaries` into the app ESLint configs and run it in the `boundaries` job (today it only lints two packages). (2) Add a **Rust** job: `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`. (3) Wire `scripts/verify-production.mjs` as a **post-deploy smoke gate** in `deploy.yml`. (4) Enforce coverage thresholds: line ≥85% **and** branch ≥80%. (5) Run Playwright in CI.

**Why:** ADR-001/§3.3 claim boundary enforcement that CI doesn't actually perform (**P1**); the highest-risk code (Rust nmap spawn) has no CI (**P2**); deploys have no automated smoke gate (**P3**); branch coverage (~70%) is unenforced (**P4**).

## CH-10 — §9.2/§9.3 Web topology graph: SSR + React 19 guardrails

**Change:** Require the web `/dashboard` to render `TopologyGraph` via a **dynamic import with `ssr: false`** and to pin a React-19 peer override/resolution for `react-force-graph-2d`.

**Why:** `react-force-graph-2d` accesses `window` at import (Next SSR/prerender crash) and declares React ≤18 peers (audit **R1**).

## CH-11 — §3.2 / ADRs: fix LibSQL vs sql.js drift

**Change:** Align ADR-002/003 wording ("embedded LibSQL/SQLite") with the implementation and §7.2 (**sql.js** serialized via the Tauri fs plugin).

**Why:** Terminology drift between ADRs and code (audit **SP2**).

---

## New doc to add: `docs/PROD-DB-TROUBLESHOOTING.md`

Capture the recurring production-DB blocker as a permanent runbook (it has now appeared twice — `ECONNREFUSED 127.0.0.1:54322`, then `ENOTFOUND postgres.<ref>`): symptom → cause → fix for each of {paused project, rotated password not updated on Vercel, wrong pooler host/port, malformed/URL-unencoded password, localhost leaking into prod}. Reference `scripts/verify-production.mjs` as the confirmation step. This turns a repeated halt into a 5-minute checklist.

---

## Not changing (and why)

- **Tiered architecture, agent model, language split, detection-only stance** — correct and well-argued; leave as is.
- **§15 out-of-scope list** — appropriate; keep the headless `scan-worker` as an interface stub.
- **superjson / neverthrow / Zod-at-the-edge / lazy DB singleton / pooler `prepare:false`** — these are right; the spec should keep mandating them.

---

## Suggested application order

CH-0 first (it's a safety fix to the document itself), then fold CH-1…CH-11 into the matching sections, then add the two new docs. I can produce the exact section-by-section diffs on your go-ahead — per scope I've stopped here for your review before editing the spec or any code.
