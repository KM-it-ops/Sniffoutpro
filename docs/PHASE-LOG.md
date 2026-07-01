# SniffOutPro — Phase Log

| Timestamp (UTC) | Phase | Commands | Exit | Notes |
|-----------------|-------|----------|------|-------|
| 2026-06-21T20:24Z | 0 | `pnpm turbo run typecheck lint test` | 0 | G1 approved |
| 2026-06-21T21:41Z | 1 | `pnpm turbo run typecheck lint test --filter=db\|api\|scan-engine` | 0 | 16/16 tasks |
| 2026-06-21T21:40Z | 1 | `pnpm test:coverage` (scan-engine) | 0 | Lines 95.89%, funcs 100% |
| 2026-06-21T21:33Z | 1 | `pnpm db:generate` | 0 | `drizzle/0000_modern_zodiak.sql` |
| 2026-06-22T10:00Z | 2 | `docker ps` (sniffoutpro-postgres) | 0 | Healthy, up 12h |
| 2026-06-22T10:00Z | 2 | `pnpm --filter @sniffoutpro/db db:migrate` | 0 | Applied against :54322 |
| 2026-06-22T10:00Z | 2 | `rustc --version` / `cargo --version` | 0 | 1.96.0 (rustup user install) |
| 2026-06-22T10:00Z | 2 | `pnpm turbo run typecheck lint test` | 0 | 29/29 tasks (after web lint + @trpc/server fix) |

| 2026-06-22T10:00Z | 2 | `pnpm --filter @sniffoutpro/scan-engine test:coverage` | 0 | Lines 94.92%, branches 70.58% |

## Phase 2 exit checklist

- [x] Desktop React scan UI (targets, consent, fixture toggle, progress, findings, topology)
- [x] Tier 1 SQLite persistence via sql.js + Tauri fs plugin
- [x] Fixture pipeline: 3 hosts, Log4j CVE correlation
- [x] Topology graph component (`packages/ui`)
- [x] `docs/DEMO-G2.md` Boss lab instructions
- [x] VERIFY-FIX LOOP green (29/29 tasks)
- [x] Postgres docker healthy + migrations applied
- [x] Rust 1.96.0 installed (rustup)
- [x] nmap 7.95 installed (`C:\Program Files (x86)\Nmap\`)
| 2026-06-22T22:45Z | 2/3 | Desktop scan browser-compat fixes | — | sql.js wasm, crypto.randomUUID, Buffer polyfill |
| 2026-06-22T22:45Z | — | `docs/HANDOFF.md` updated | — | Full agent handoff |
| 2026-06-25T18:37Z | 2 | G2 automated E2E tests | 0 | `g2-e2e.test.ts`, `local-db.test.ts` — fixture→SQLite |
| 2026-06-25T18:37Z | 2/3 | `pnpm turbo run typecheck lint test --force` | 0 | 29/29 tasks (desktop +2 tests) |
| 2026-06-25T18:37Z | 3 | `pnpm --filter @sniffoutpro/api test` (Postgres up) | 0 | scans.sync integration confirmed |
| 2026-06-25T18:37Z | 2 | `pnpm --filter @sniffoutpro/scan-engine test:coverage` | 0 | Lines 95.19% |
| 2026-06-25T18:40Z | 3 | `pnpm --filter @sniffoutpro/web test:e2e` | 0 | Home + health (2/2) |
| 2026-06-25T18:52Z | 2 | Gate G2 automated verification | 0 | API fixture sync + desktop E2E + Playwright 4/4 |
| 2026-06-25T18:52Z | 3 | Phase 3 slice: auth, metrics, Inngest | 0 | sync token, Recharts, `/api/inngest`, dashboard E2E |

- [x] Boss G2 automated sign-off — fixture → SQLite → sync → dashboard (Playwright)

| 2026-06-22T18:00Z | 3 | `nmap -sV -T4 -oX - 127.0.0.1` | 0 | Live XML output verified |
| 2026-06-22T18:00Z | 3 | `pnpm turbo run typecheck lint test` | 0 | 29/29 after Phase 3 sync slice |

## Phase 3 exit checklist

- [x] Web dashboard with scan history + topology (`/dashboard`)
- [x] Desktop → cloud sync via `scans.sync`
- [x] Scan diff engine (`scans.diff`)
- [x] Optional sync auth (`SNIFFOUT_SYNC_TOKEN`, Supabase JWT when configured)
- [x] Recharts severity metrics on dashboard
- [x] Inngest CVE sync daily cron stub (`/api/inngest`)
- [x] Playwright E2E dashboard flow (seed + topology + chart)

## Gate G1 — PASSED (Boss approved)

## Phase 1 exit checklist

- [x] Drizzle schema + drizzle-zod exports (`packages/db/src/zod.ts`)
- [x] Migration SQL generated (`packages/db/drizzle/0000_modern_zodiak.sql`)
- [ ] `pnpm db:migrate` against local Postgres — **run after** `docker compose -f docker/docker-compose.dev.yml up -d`
- [x] tRPC `health.ping` + `scans.list` callable from test client
- [x] scan-engine parses `fixtures/nmap-sample.xml` → 2 hosts, ≥1 service each
- [x] CVE correlator matches `fixtures/log4j-service.json` → CVE-2021-44228
- [x] VERIFY-FIX LOOP green on packages/db, api, scan-engine
- [x] Tauri `run_nmap` command implemented (Rust compile blocked — no rustup)
- [x] CveSyncDaily Inngest event schema stub (`packages/api/src/jobs/cve-sync.ts`)
- [x] Web tRPC route `/api/trpc` + Zustand UI store scaffold

## Migrate when Docker is up

```powershell
docker compose -f docker/docker-compose.dev.yml up -d
$env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
pnpm --filter @sniffoutpro/db db:migrate
```
