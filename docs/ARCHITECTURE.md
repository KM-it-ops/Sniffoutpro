# Architecture overview

See [decisions/003-agent-model.md](../decisions/003-agent-model.md) for the canonical agent model diagram.

## Layers

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Desktop agent | `apps/desktop` + `packages/scan-rust` | Execute scans, local SQLite (Tier 1) |
| Scan engine | `packages/scan-engine` | Parse, correlate, score, diff |
| API | `packages/api` | tRPC routers, subscriptions |
| Web | `apps/web` | Dashboard, topology, reports UI |
| DB | `packages/db` | Drizzle schema, migrations |

## Dependency direction

`apps/*` → `packages/*` only. Enforced by `eslint-plugin-boundaries` in CI.

## State management

- **TanStack Query**: all server state.
- **Zustand**: UI-only (selected graph node, panel open).
- Never mirror API data in Zustand.
