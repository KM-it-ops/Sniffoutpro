# SniffOutPro — Greenfield Build Specification

**Version:** 2.1  
**Date:** 2026-07-09

> **Current state (2026-07):** This product is **already built through Phase 3** (Gate G2b) — a live pnpm+Turbo monorepo deployed to Vercel + Supabase. This document is the _design source of truth_, **not** a signal to re-scaffold. For resume/execution, `docs/HANDOFF.md` + `docs/AUTONOMOUS-EXECUTION-ADDENDUM.md` are authoritative. Treat §§1–13 as the target design and §14 gates as a _checklist of what is done vs. remaining_, not a from-scratch build order. **Do not** assume an empty repository.

**Purpose:** Design + phase checklist for SniffOutPro. Phases 0–3 / Gates G1, G2, G2b are **DONE**. Remaining work is Phases 4–7.

---

## 1. Product definition

**SniffOutPro** is a visual, interactive vulnerability assessment platform for **authorized** security testing.

| Attribute     | Value                                                         |
| ------------- | ------------------------------------------------------------- |
| Category      | Host/service discovery + CVE correlation + risk visualization |
| Not           | Nessus, OpenVAS, or exploit framework replacement             |
| Detection     | Identification only — no exploit execution                    |
| Scan location | Desktop agent only — web never scans a user's network         |
| Delivery      | Turborepo monorepo, four commercial tiers, one codebase       |

**Elevator pitch:** A lightweight desktop scanner with a beautiful topology dashboard. Offline-first for labs; cloud sync for history, diffs, and consultant reports.

---

## 2. Users and commercial tiers

Four tiers ship in one codebase. Features are gated in **both** UI and API.

| Tier            | Persona            | Storage             | Auth | History | Schedules | Reports     | Multi-tenant |
| --------------- | ------------------ | ------------------- | ---- | ------- | --------- | ----------- | ------------ |
| **PERSONAL**    | Hobbyist / lab     | Local SQLite        | No   | No      | No        | No          | No           |
| **WORKSTATION** | Solo analyst / IT  | Postgres (Supabase) | Yes  | Yes     | Yes       | No          | No           |
| **CONSULTANT**  | Pentest / vCISO    | Postgres (Supabase) | Yes  | Yes     | Yes       | Branded PDF | No           |
| **ADMIN**       | MSP / platform ops | Postgres (Supabase) | Yes  | Yes     | Yes       | Yes         | Yes          |

**Tier source of truth** — create `packages/types/src/tiers.ts`:

```typescript
export const TierEnum = z.enum(['PERSONAL', 'WORKSTATION', 'CONSULTANT', 'ADMIN']);

export const TIER_FEATURES = {
  PERSONAL: {
    cloudSync: false,
    auth: false,
    history: false,
    schedules: false,
    reports: false,
    multiTenant: false,
  },
  WORKSTATION: {
    cloudSync: true,
    auth: true,
    history: true,
    schedules: true,
    reports: false,
    multiTenant: false,
  },
  CONSULTANT: {
    cloudSync: true,
    auth: true,
    history: true,
    schedules: true,
    reports: true,
    multiTenant: false,
  },
  ADMIN: {
    cloudSync: true,
    auth: true,
    history: true,
    schedules: true,
    reports: true,
    multiTenant: true,
  },
} as const;
```

Export `hasTierFeature(tier, feature)` and `tierAtLeast(current, required)`.

**Rule:** Disabled-tier UI must not render. API must reject tier-exceeded procedures with `FORBIDDEN`.

---

## 3. Architecture (non-negotiable)

### 3.1 Agent model

```
┌─────────────────┐     tRPC sync      ┌──────────────────┐
│  Desktop Agent  │ ─────────────────► │  Web Dashboard   │
│  Tauri v2+Rust  │   (when online)    │  Next.js 15      │
│  scan-engine    │                    │  viz + control   │
└────────┬────────┘                    └────────┬─────────┘
         │ PERSONAL: SQLite                     │ WORKSTATION+: Postgres
         ▼                                      ▼
   sql.js + Tauri fs                      Supabase + RLS (ADMIN)
```

**Hard rules:**

1. Scans originate on desktop for tiers PERSONAL–CONSULTANT.
2. Web imports scan-engine for parsing fixtures in tests only — never executes scans in production.
3. Authorization scope (targets + consent) is immutable per `scan_run`.
4. Tier 4 optional headless `scan-worker` — define TypeScript interface only; do not implement in v1.

### 3.2 Language split

| Layer                    | Language         | Responsibility                                                                             |
| ------------------------ | ---------------- | ------------------------------------------------------------------------------------------ |
| `packages/scan-engine`   | TypeScript       | nmap XML parse, CVE correlation, risk scoring, diffs, progress events — **no network I/O** |
| `apps/desktop/src-tauri` | Rust             | Spawn nmap/nuclei subprocesses, stream stdout, resolve binary paths                        |
| `packages/api`           | TypeScript       | tRPC routers, auth, tier middleware                                                        |
| `packages/db`            | TypeScript       | Drizzle schemas, migrations (Postgres + SQLite)                                            |
| `apps/web`               | TypeScript/React | Dashboard, reports UI, API routes, Inngest                                                 |

### 3.3 Dependency direction

`apps/*` → `packages/*` only. Enforce with `eslint-plugin-boundaries` in CI.

### 3.4 State management

- **TanStack Query:** all server/API state.
- **Zustand:** UI-only (selected graph node, panel open/closed).
- Never duplicate API data in Zustand.

---

## 4. Repository structure to create

Initialize a pnpm + Turbo monorepo named `sniffoutpro`:

```
sniffoutpro/
├── apps/
│   ├── web/                 @sniffoutpro/web — Next.js 15 App Router
│   └── desktop/             @sniffoutpro/desktop — Tauri v2 + React
├── packages/
│   ├── config/              @sniffoutpro/config — eslint, tsconfig, tailwind presets
│   ├── types/               @sniffoutpro/types — Zod schemas, tier flags
│   ├── db/                  @sniffoutpro/db — Drizzle Postgres + SQLite
│   ├── scan-engine/         @sniffoutpro/scan-engine — pure scan logic
│   ├── api/                 @sniffoutpro/api — tRPC app router
│   └── ui/                  @sniffoutpro/ui — TopologyGraph, shared components
├── decisions/               ADRs (create during Phase 0)
├── docs/                    Ethics, architecture, demo script
├── scripts/                 Bootstrap, verify, token generation
├── docker/
│   └── docker-compose.dev.yml   Local Postgres on :54322
├── supabase/
│   └── config.toml
├── .github/workflows/
│   ├── ci.yml
│   └── deploy.yml
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

**Toolchain (pin in `package.json`):**

- Node ≥20, pnpm 9+, Rust stable (≥1.77)
- Turbo 2.x, TypeScript 5.8+, Next.js 15, Tauri 2
- Drizzle ORM, Vitest, Playwright, tRPC 11, Zod 3, superjson
- TanStack Query, Zustand, Recharts, react-force-graph-2d
- Inngest (background jobs), Supabase (auth + Postgres)

---

## 5. Domain types

Create `packages/types/src/scan.ts` with Zod schemas:

```typescript
Severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
ScanIntensity: 'light' | 'standard' | 'deep'
ScanStatus: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

Service: { port, protocol: 'tcp'|'udp', product?, version?, banner? }
Host: { ip, hostname?, mac?, os?, osConfidence?, services: Service[] }
Finding: { id: uuid, cveId?, title, severity, cvssScore?, riskScore: 0-100, hostIp, port?, description? }
ScanRun: { id: uuid, status, targets: string[], intensity, startedAt, completedAt?, hosts, findings }

ScanProgressEvent (discriminated union):
  | { type: 'progress', percent: 0-100, message }
  | { type: 'host_discovered', host: Host }
  | { type: 'finding', finding: Finding }
  | { type: 'complete', scanRun: ScanRun }
  | { type: 'error', message }
```

---

## 6. Scan engine

Package: `@sniffoutpro/scan-engine`. Zero network calls. All logic unit-testable.

### 6.1 Pipeline

```
Input: nmap XML string + CVE cache entries
  → parseNmapXml(xml) → Host[]
  → hostsToServiceContexts(hosts) → ServiceContext[]
  → correlateCves(services, cveCache) → Finding[]
  → scoreRisk() per finding → riskScore 0-100
  → assemble ScanRun
  → diffScanRuns(base, compare) → { newFindings, resolvedFindings, unchangedCount }
```

### 6.2 nmap execution (Rust, desktop only)

Tauri commands:

| Command                | Input                                   | Output                               |
| ---------------------- | --------------------------------------- | ------------------------------------ |
| `run_nmap`             | `targets: string`, `intensity?: string` | `{ xml: string, exit_code: number }` |
| `get_fixture_nmap_xml` | —                                       | embedded fixture XML string          |

**Intensity → nmap args:**

| Intensity  | Args                                               |
| ---------- | -------------------------------------------------- |
| `light`    | `-T4 -sV -oX - <targets>`                          |
| `standard` | `-sV -oX - <targets>` (default)                    |
| `deep`     | `-sV -O --script=ssl-enum-ciphers -oX - <targets>` |

Resolve nmap binary: `nmap` on PATH; on Windows also check `C:\Program Files (x86)\Nmap\nmap.exe` and `C:\Program Files\Nmap\nmap.exe`.

**Optional future:** nuclei with templates tagged `cve` or `misconfig` only.

### 6.3 CVE correlation

```typescript
CveCacheEntry: { id, description?, cvssScore?, affectedProducts: { product, vendor?, versionStart?, versionEnd? }[] }
```

- Match service `product` with **tokenized/exact** product+vendor matching (not bidirectional substring — `"ssh"` must not match `"sh"`).
- Check `version` with **semver-aware** comparison (not lexicographic string `<`/`>` — `"9"` must sort below `"10"`).
- Once on NVD 2.0, prefer CPE match strings (`versionStartIncluding` / `versionEndExcluding`).
- Dedupe by `hostIp:port:cveId`.
- Map CVSS → severity: ≥9 critical, ≥7 high, ≥4 medium, >0 low, else info.
- `scoreRisk({ cvssScore, severity, exposure: 'local'|'network', assetCriticality? })` → 0–100.

### 6.4 Lab fixture (required for CI)

Embed `packages/scan-engine/fixtures/nmap-sample.xml` that parses to:

- **3 hosts:** 127.0.0.1, 192.168.1.10, 192.168.1.20
- **≥1 service per host**
- **Log4j finding:** CVE-2021-44228 on 127.0.0.1:8080 (use `fixtures/log4j-service.json` for correlation input)

CI and Playwright **must never invoke live nmap**.

### 6.5 Ethics guardrails (engine + UI)

Implement before first scan button works. Shared module: `validateScanScope(targets, opts)` in `@sniffoutpro/scan-engine` (unit-tested), consumed by desktop UI **and** re-validated at the Rust privilege boundary.

1. Consent checkbox with fixed text: _"I own or have written authorization to scan the targets listed below."_ — **DONE**
2. Store consent immutably in `authorization_scopes` linked to each `scan_run`. — **DONE**
3. Default max CIDR `/16` — larger requires confirmation / override. — **IMPLEMENTED** via `validateScanScope`
4. Max job size 65536 ports × 256 hosts — larger requires confirmation / override. — **IMPLEMENTED** via `validateScanScope`
5. Private/reserved ranges blocked unless user explicitly overrides. — **IMPLEMENTED** via `validateScanScope` + UI checkbox
6. No exploit execution, payload delivery, or authenticated brute force. — **DONE** (product stance)

**Rust `run_nmap`:** MUST NOT trust the renderer. Validate `targets` against IP/CIDR/hostname allowlist, reject any argument beginning with `-`, insert literal `--` before targets so nmap stops option parsing.

---

## 7. Data model

### 7.1 PostgreSQL (Drizzle + Supabase)

Create all tables in initial migration:

| Table                  | Columns (key)                                                                                                            | Purpose             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| `organizations`        | id, name, slug, created_at                                                                                               | Multi-tenant root   |
| `users`                | id, email, display_name, created_at                                                                                      | Accounts            |
| `memberships`          | id, org_id, user_id, role: admin\|analyst\|viewer                                                                        | Org access          |
| `authorization_scopes` | id, user_id?, targets: jsonb, consent_text, consented_at                                                                 | Immutable consent   |
| `networks`             | id, org_id?, name, cidr                                                                                                  | Named target groups |
| `scan_runs`            | id, org_id?, authorization_scope_id, status, targets, intensity, started_at, completed_at, raw_output, normalized_output | Scan metadata       |
| `hosts`                | id, scan_run_id, org_id?, ip, hostname, mac, os, os_confidence                                                           | Per-run hosts       |
| `services`             | id, host_id, org_id?, port, protocol, product, version, banner                                                           | Per-host services   |
| `findings`             | id, scan_run_id, host_id?, service_id?, org_id?, cve_id?, title, severity, cvss_score, risk_score, description, port?    | Vuln findings       |
| `cve_cache`            | id (CVE id), description, cvss_score, published_at, last_synced_at, raw: jsonb                                           | NVD cache           |
| `scan_diffs`           | id, base_scan_run_id, compare_scan_run_id, new/resolved/changed counts, diff_payload                                     | Persisted diffs     |
| `ssl_certificates`     | id, host_id, port, subject, issuer, valid_from, valid_to, weak_cipher, chain_issues                                      | Deep scan TLS       |
| `scan_jobs`            | id, org_id?, cron, targets, intensity, enabled                                                                           | Scheduled scans     |
| `client_profiles`      | id, org_id, name, logo_url, notes                                                                                        | Consultant clients  |
| `report_templates`     | id, org_id, name, branding: jsonb                                                                                        | Report branding     |

**Indexes (migration `0001_audit_hardening`):** FK indexes on `hosts.scan_run_id`, `services.host_id`, `findings.scan_run_id`/`host_id`/`service_id`, plus `scan_runs(started_at DESC)` and `org_id` indexes on leaf tables.

**Auth mapping:** Supabase `auth.users.id` is source of truth at Phase 4; `public.users.id` mirrors `auth.uid` (same UUID).

**Postgres client:** `prepare: false` when using Supabase transaction pooler (port 6543).

**RLS:** Enable on all tables when building ADMIN tier. Policies scope rows by `org_id` from JWT claims (`org_id` denormalized onto hosts/services/findings).

### 7.2 SQLite (Tier PERSONAL)

Mirror subset in `packages/db/src/schema/sqlite.ts`:
`authorization_scopes`, `scan_runs`, `hosts`, `services`, `findings`.

**Persistence:** sql.js in-memory DB, serialized to bytes, written via Tauri fs plugin to:

- Windows: `%APPDATA%/com.sniffoutpro.desktop/sniffoutpro-tier1.db`
- macOS: `~/Library/Application Support/com.sniffoutpro.desktop/sniffoutpro-tier1.db`
- Linux: `~/.local/share/com.sniffoutpro.desktop/sniffoutpro-tier1.db`

---

## 8. API (tRPC)

Package: `@sniffoutpro/api`. Web mounts at `/api/trpc/[trpc]`.

**Config:** superjson transformer. Context: `{ db, logger, userId: string|null, tier: Tier, syncAuthorized: boolean }`.

### 8.1 Procedures to implement

| Router      | Procedure                                     | Auth                           | Min tier    |
| ----------- | --------------------------------------------- | ------------------------------ | ----------- |
| `health`    | `ping`                                        | public                         | PERSONAL    |
| `scans`     | `list({ limit? })`                            | public† (rate-limited)         | WORKSTATION |
| `scans`     | `getDetail({ id })`                           | public† (rate-limited)         | WORKSTATION |
| `scans`     | `sync({ consentText, scanRun, rawOutput? })`  | sync                           | WORKSTATION |
| `scans`     | `diff({ baseScanId, compareScanId })`         | public† (rate-limited)         | WORKSTATION |
| `hosts`     | `list({ scanRunId })`                         | public† → protected at Phase 4 | WORKSTATION |
| `findings`  | `list({ scanRunId })`                         | public† → protected at Phase 4 | WORKSTATION |
| `auth`      | `me`                                          | protected                      | WORKSTATION |
| `schedules` | CRUD                                          | protected                      | WORKSTATION |
| `clients`   | CRUD                                          | protected                      | CONSULTANT  |
| `reports`   | `generate({ templateId, scanIds, clientId })` | protected                      | CONSULTANT  |
| `orgs`      | CRUD + invite                                 | protected                      | ADMIN       |

†**Pre-G6 lockdown checklist (single-tenant until Phase 4):**

1. Document deployment as single-tenant; rate-limit all public reads.
2. Regression test: assert `scans.list` / `getDetail` / `diff` / `hosts.list` / `findings.list` reject unauthenticated requests in production once auth is wired (`packages/api/src/lockdown.test.ts`).
3. Flip those procedures to `protectedProcedure` before Gate G6 — no untracked footnotes.

### 8.2 Auth resolution

On each request, resolve from `Authorization: Bearer <token>`:

1. If token matches `SNIFFOUT_SYNC_TOKEN` env (constant-time compare) → `syncAuthorized: true`.
2. If token is valid Supabase JWT (verify via `SUPABASE_URL` + `SUPABASE_ANON_KEY`) → `userId` set, `syncAuthorized: true`.
3. **Fail-closed in production:** if `VERCEL` or `NODE_ENV=production` and there is no valid JWT and `SNIFFOUT_SYNC_TOKEN` is unset/empty → `syncAuthorized` MUST be `false` (log startup error). Dev-only may allow open sync when token is unset.

**Tier:** Read `SNIFFOUT_TIER` env on server until per-user tier from membership is implemented.

### 8.3 `scans.sync` transaction

Atomic insert order:

1. `authorization_scopes` (new UUID, targets, consent_text, consented_at)
2. `scan_runs` (idempotent on `scanRun.id`)
3. `hosts` + `services`
4. `cve_cache` upserts (on conflict do nothing)
5. `findings`

Return `{ ok: true, scanId }`.

### 8.4 Web DB initialization

Create `apps/web/src/lib/db.ts`:

- Read `process.env.DATABASE_URL`.
- If missing and `VERCEL` or `NODE_ENV=production` → throw (no localhost fallback).
- Dev fallback: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
- Lazy singleton `getDb()` — do not connect at module load.

---

## 9. User interface

### 9.1 Desktop app

**Framework:** Tauri 2 + React 19 + Vite.

**Single-page layout:**

1. Header — product name, tier label
2. Scan form — targets input, intensity select, consent checkbox, fixture toggle (dev/CI)
3. Run button — disabled until consent checked
4. Progress bar — driven by `ScanProgressEvent`
5. Topology graph — lazy-loaded from `@sniffoutpro/ui`
6. Findings table — sortable by severity (critical first)
7. Host detail panel — services + findings for selected node
8. Sync button (WORKSTATION+) — calls `scans.sync` via tRPC HTTP client

**Visual design:**

- Dark security-tool aesthetic
- Severity colors: critical `#dc2626`, high `#ea580c`, medium `#ca8a04`, low `#2563eb`, info `#64748b`
- Typography: clean sans-serif, high contrast

### 9.2 Web app

**Framework:** Next.js 15 App Router.

| Route              | Tier         | Content                                                   |
| ------------------ | ------------ | --------------------------------------------------------- |
| `/`                | all          | Landing, product explanation, links                       |
| `/dashboard`       | WORKSTATION+ | Scan history list, topology, severity chart, diff compare |
| `/reports`         | CONSULTANT+  | Client picker, template editor, PDF export                |
| `/admin`           | ADMIN        | Org list, user invites, usage overview                    |
| `/login`           | WORKSTATION+ | Supabase Auth (email/password or OAuth)                   |
| `/api/health`      | —            | `{ status: 'ok' }`                                        |
| `/api/trpc/[trpc]` | —            | tRPC handler                                              |
| `/api/inngest`     | —            | Inngest serve endpoint                                    |

**Dashboard requirements:**

- Scan history sidebar (status, targets, timestamp)
- Click scan → load detail via `scans.getDetail`
- TopologyGraph with host selection
- Recharts bar/pie of finding severities
- Compare dropdown → `scans.diff` → show new/resolved counts + lists

### 9.3 TopologyGraph (`packages/ui`)

Props: `{ hosts, findings, selectedHostIp?, onSelectHost?, width?, height? }`.

- Force-directed 2D graph (`react-force-graph-2d`)
- One node per host; node color = highest severity finding on that host
- Node size scales with service count
- Click node → `onSelectHost(ip)`
- Edges: connect hosts sharing a /24 subnet (visual grouping only)

---

## 10. Background jobs (Inngest)

Host in `apps/web`. Register at `/api/inngest`.

| Event            | Schedule             | Handler                                                                                                                                                                                                                                            |
| ---------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cve/sync.daily` | Cron `0 3 * * *` UTC | Fetch **NVD 2.0 REST API** (`NVD_API_KEY`), incremental `lastModStartDate`/`lastModEndDate` (≤120 days), paginated `resultsPerPage`/`startIndex`, rate-limit backoff (50 req/30s with key); persist `last_synced_at` as cursor; upsert `cve_cache` |
| `scan/dispatch`  | Per `scan_jobs.cron` | Future: notify desktop agent (v2)                                                                                                                                                                                                                  |

Do **not** use legacy NVD JSON feeds (retiring). CVE sync must handle rate limits, incremental updates, and log sync counts.

---

## 11. Security

| Requirement            | Implementation                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| No secrets in git      | `.env*` gitignored; use Doppler or platform env vars                                                                                              |
| Sync token             | Generate 32-byte random token; store in Vercel + desktop build env; compare with `crypto.timingSafeEqual`                                         |
| Production sync        | Fail-closed: require token or JWT — never open when token unset                                                                                   |
| Desktop sync token     | Shared `VITE_SYNC_TOKEN` is extractable from binaries — acceptable for single-tenant WORKSTATION; replace with per-user JWT at Phase 4            |
| Multi-tenant isolation | Supabase RLS on `org_id` for ADMIN tier (`hosts`/`services`/`findings` carry `org_id`)                                                            |
| Rate limiting          | In-memory rate limit on public/unauthed tRPC reads until Phase 4                                                                                  |
| Error tracking         | Sentry (or equivalent) on web + API — wire before G6                                                                                              |
| Secret rotation        | See `docs/PROD-DB-TROUBLESHOOTING.md` — rotate Supabase DB password + `SNIFFOUT_SYNC_TOKEN`, update Vercel, redeploy, run `verify-production.mjs` |
| CI secret scan         | gitleaks on every push                                                                                                                            |
| Dependency audit       | `pnpm audit --audit-level high` in CI                                                                                                             |
| Analytics              | PostHog optional; **never send raw IPs or hostnames**                                                                                             |
| Consent audit trail    | `authorization_scopes` immutable, linked to every scan                                                                                            |

---

## 12. Infrastructure

### 12.1 Local development

```bash
# Postgres
docker compose -f docker/docker-compose.dev.yml up -d
# → postgresql://postgres:postgres@127.0.0.1:54322/postgres

pnpm install
pnpm turbo run typecheck lint test
pnpm --filter @sniffoutpro/db db:migrate

pnpm --filter @sniffoutpro/web dev          # http://localhost:3000
pnpm --filter @sniffoutpro/desktop tauri dev
```

### 12.2 Production web (Vercel + Supabase)

**Vercel project settings:**

| Setting         | Value                                                        |
| --------------- | ------------------------------------------------------------ |
| Root Directory  | `apps/web`                                                   |
| Install Command | `cd ../.. && pnpm install`                                   |
| Build Command   | `cd ../.. && pnpm turbo run build --filter=@sniffoutpro/web` |
| Framework       | Next.js                                                      |

**Critical:** Set `outputFileTracingRoot` in `apps/web/next.config.ts` to monorepo root:

```typescript
const monorepoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
```

Do **not** use output-directory copy hacks. Do **not** commit a root `vercel.json` with path workarounds.

**Environment variables (production):**

| Variable              | Example / notes                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`        | `postgresql://postgres.<ref>:<pw>@<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require` |
| `SNIFFOUT_SYNC_TOKEN` | Random 32+ char string                                                                                       |
| `SNIFFOUT_TIER`       | `WORKSTATION` (or CONSULTANT / ADMIN)                                                                        |
| `SUPABASE_URL`        | `https://<ref>.supabase.co`                                                                                  |
| `SUPABASE_ANON_KEY`   | Project anon key                                                                                             |

URL-encode database password special characters. On Windows, set `DATABASE_URL` via Vercel dashboard or single-quoted PowerShell — unquoted `&` breaks CLI.

### 12.3 Desktop production build

```bash
# apps/desktop/.env.production.local (gitignored)
VITE_WEB_URL=https://<your-vercel-domain>
VITE_SYNC_TOKEN=<same as SNIFFOUT_SYNC_TOKEN>

pnpm --filter @sniffoutpro/desktop tauri build
```

### 12.4 CI/CD

**`ci.yml`** on push/PR to `main`:

- typecheck, lint, test (all packages)
- eslint-plugin-boundaries across apps + packages (ADR-001)
- Rust: `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`
- Coverage thresholds: line ≥85% **and** branch ≥80% (scan-engine)
- Playwright e2e in CI
- `pnpm audit --audit-level high`
- gitleaks

**`deploy.yml`** on push to `main`:

1. verify (typecheck + lint + test + web build)
2. migrate (`DATABASE_URL` from GitHub secret)
3. deploy (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`)
4. post-deploy smoke: `scripts/verify-production.mjs`

---

## 13. Testing strategy

| Layer            | Tool                     | Requirement                                  |
| ---------------- | ------------------------ | -------------------------------------------- |
| scan-engine unit | Vitest                   | ≥85% line coverage; fixture-only             |
| API integration  | Vitest + Docker Postgres | `scans.sync` round-trip with fixture ScanRun |
| Desktop E2E      | Vitest                   | fixture scan → SQLite persistence → reread   |
| Web E2E          | Playwright               | home, health, dashboard with seeded scan     |
| Auth             | Vitest                   | sync rejected without token in prod mode     |
| CI               | —                        | Zero live network scans                      |

**Production smoke script** (`scripts/verify-production.mjs`):

```bash
node scripts/verify-production.mjs <base-url> <sync-token>
# Must pass: health, trpc ping, sync auth gate, scans.list with token
```

---

## 14. Build phases and acceptance gates

Build in order. Do not skip gates.

### Phase 0 — Scaffold (Gate G1)

**Deliver:**

- Monorepo initialized with all packages (empty exports OK)
- Turbo pipeline: build, dev, lint, typecheck, test
- ESLint + Prettier + husky + commitlint
- Three ADRs written to `decisions/`
- CI workflow green on empty implementations
- `.env.example` files in apps (no real secrets)

**G1 pass when:** `pnpm turbo run typecheck lint test` exits 0.

---

### Phase 1 — Core infrastructure

**Deliver:**

- Full Drizzle Postgres schema + migration SQL
- SQLite schema + sql.js client
- All Zod types in `@sniffoutpro/types`
- Tier flags + tests
- tRPC skeleton: `health.ping`, `scans.list` (empty), context factory
- scan-engine: `parseNmapXml` + fixture test (2 hosts, ≥1 service each)
- Tauri `run_nmap` + `get_fixture_nmap_xml` commands
- Web `/api/trpc` route wired

**Pass when:** Fixture XML parses; migration applies to local Postgres; `health.ping` returns via HTTP.

---

### Phase 2 — Tier PERSONAL MVP (Gate G2)

**Deliver:**

- CVE correlator + `scoreRisk` + `diffScanRuns`
- Full desktop scan UI (form → progress → topology → findings → host detail)
- Fixture pipeline end-to-end: 3 hosts, Log4j CVE-2021-44228
- SQLite persistence across app restart
- Live nmap path (when binary present)
- Ethics guardrails (consent, scope limits)
- `docs/DEMO-G2.md` — 15-minute lab demo script
- scan-engine coverage ≥85%

**G2 pass when:**

- [ ] Fixture scan shows 3 topology nodes
- [ ] Log4j finding visible on 127.0.0.1:8080
- [ ] SQLite file created in AppData
- [ ] `pnpm turbo run typecheck lint test` green
- [ ] Automated desktop E2E test passes

---

### Phase 3 — Tier WORKSTATION (Gate G2b) — **DONE** (2026-07)

**Deliver:**

- `scans.sync` full transaction
- Desktop sync button + tRPC HTTP client
- Web `/dashboard`: history, topology (`dynamic` import `ssr: false` for `react-force-graph-2d`), severity chart, diff compare
- Sync auth fail-closed (`SNIFFOUT_SYNC_TOKEN` + optional Supabase JWT)
- Supabase project provisioned; migrations applied to pooler
- Vercel deploy with correct monorepo settings
- `scripts/verify-production.mjs`
- Playwright dashboard E2E (seed scan → view topology)
- Inngest CVE sync job stub (NVD **2.0** API contract)
- Lazy DB init (no localhost fallback in production)

**G2b pass when:**

- [x] Desktop fixture scan → sync → visible on production dashboard
- [x] `verify-production.mjs` / live probe: health + `scans.list` return data
- [x] Playwright dashboard spec present
- [x] `scans.list` returns data (not connection refused / not ENOTFOUND)

---

### Phase 4 — Auth and schedules

**Deliver:**

- Supabase Auth UI (sign up, login, logout) on web
- `protectedProcedure` on all non-public routes
- Tier middleware on tRPC
- `scan_jobs` CRUD API
- Desktop schedule polling (check due jobs, auto-run with stored consent policy)
- `auth.me` returns user + tier

**Pass when:** Unauthenticated user cannot call `scans.sync` or `auth.me`; schedule creates and lists.

---

### Phase 5 — Tier CONSULTANT (Gate G3)

**Deliver:**

- `client_profiles` + `report_templates` CRUD
- Logo upload to Supabase Storage
- PDF report generator (executive summary, finding table, topology snapshot, remediation appendix)
- `/reports` UI: pick client, template, scans → export PDF
- Branded output with consultant logo/colors

**G3 pass when:** Consultant can generate a PDF from a synced scan with custom branding.

---

### Phase 6 — Tier ADMIN (Gate G4)

**Deliver:**

- Organization CRUD + user invite flow
- Membership roles enforced in API + UI
- RLS policies on all Postgres tables
- `/admin` dashboard: org list, member management
- Per-org scan isolation verified by test

**G4 pass when:** Two orgs cannot see each other's scans; admin can invite analyst.

---

### Phase 7 — Commercial and ship (Gate G5 + G6)

**Deliver:**

- Pricing page mapping tiers to features
- License key or Stripe subscription → tier assignment
- PostHog feature flags mirroring tier gates
- Code-signed Tauri builds (Windows + macOS)
- Auto-update channel
- Public documentation site
- Support runbook

**G6 pass when:**

- [ ] Clean-machine demo (`DEMO-G2.md`) completes in <15 minutes
- [ ] Signed installer installs and runs fixture scan
- [ ] All four tiers demonstrable with enforcement
- [ ] CI + deploy pipeline fully automated

---

## 15. Out of scope (v1)

- Exploit execution or payload delivery
- OpenVAS / Nessus compatibility
- Browser-based or WebRTC scanning
- Cloud-only scanning (no desktop agent)
- Full nuclei template library
- Mobile app (iOS/Android)
- Real-time web streaming of live scan progress (desktop-only for now)
- Headless `scan-worker` implementation (interface stub only)

---

## 16. Definition of done

The product is **complete** when all gates G1–G6 pass and:

1. All four tiers work with UI + API enforcement.
2. Desktop: offline scan, cloud sync, schedules, signed installers.
3. Web: auth, dashboard, diffs, branded reports, admin panel.
4. CVE cache refreshes daily from NVD.
5. Ethics guardrails block unscanned/unconsented runs.
6. No secrets in repository; production sync requires authentication.
7. CI green on every PR; `main` auto-deploys web with migrations.

---

## 17. Agent instructions

**Start state (2026-07):** Existing monorepo through Phase 3 / Gate G2b. Do **not** re-scaffold. Resume from `docs/HANDOFF.md` + `docs/AUTONOMOUS-EXECUTION-ADDENDUM.md`.

**Build order:** Phases 0–3 are done. Continue Phase 4 → 5 → 6 → 7. Do not skip gates.

**Constraints:**

- Never commit `.env`, tokens, or database passwords.
- Never run live nmap in CI.
- Never let web execute scans against user networks.
- Never hide tier-gated features with CSS only — enforce in API.
- Vercel deploy uses `apps/web` root + `outputFileTracingRoot` — no copy hacks.
- Production DB issues: follow `docs/PROD-DB-TROUBLESHOOTING.md`.

**This document is the design source of truth.** Execution state lives in HANDOFF + PHASE-LOG.

---

_End of greenfield build specification (v2.1)._
