# ADR 003: Scan Agent Model

## Status

Accepted (Phase 0)

## Context

Users need local scanning with optional cloud sync, consultant reporting, and future multi-tenant admin. The agent model must be explicit to prevent architecture drift.

## Decision

```
┌─────────────────┐     tRPC sync      ┌──────────────────┐
│  Desktop Agent  │ ─────────────────► │  Web Dashboard   │
│  (Tauri + Rust) │   (when online)    │  (Next.js)       │
│                 │                    │  viz + control   │
│  scan-engine    │                    │  no raw scans    │
└────────┬────────┘                    └────────┬─────────┘
         │                                      │
         │ Tier 1: SQLite                       │ Tier 2+: Supabase
         ▼                                      ▼
   Local LibSQL                          PostgreSQL + RLS
```

**Rules:**

1. Tiers 1–3: scans always originate on desktop.
2. Desktop holds scan-engine locally; syncs results via tRPC when online.
3. Tier 1: embedded SQLite via Drizzle — no Supabase required.
4. Tier 4: optional headless `scan-worker` package — **interface stub only in v1**.
5. Authorization scope is immutable per `scan_run`.
6. Rate limits and public/reserved range blocks enforced in engine + UI.

## Consequences

- Desktop is required for MVP demos (Gate G2).
- Web E2E tests mock scan fixtures; Playwright never invokes nmap.
- Tier 4 worker stub documents future headless path without implementing it in v1.

## Alternatives considered

- **Cloud worker only**: Rejected for Tier 1 offline requirement.
- **Browser WebRTC scanning**: Rejected — insufficient privileges and ethics surface.
