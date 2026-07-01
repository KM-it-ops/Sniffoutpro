# SniffOutPro

Visual, interactive vulnerability assessment platform. Scans run on the **desktop agent** (Tauri); the **web dashboard** is the control plane and visualization layer.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Monorepo runtime |
| pnpm | 9+ | Package manager |
| Rust stable | latest | Tauri desktop builds |
| nmap | 7+ | Scan engine (desktop) |
| Supabase CLI | latest | Local PostgreSQL (Tier 2+) |
| Doppler CLI | latest | Secrets (zero committed `.env`) |
| GitHub CLI | latest | CI babysit / PR workflow |

Install helpers (Windows):

```powershell
winget install Rustlang.Rustup
winget install Insecure.Nmap
scoop install supabase
winget install doppler.doppler
```

## Quick start

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
pnpm install
pnpm turbo run typecheck lint test
pnpm --filter @sniffoutpro/web dev
pnpm --filter @sniffoutpro/desktop tauri dev
```

## Monorepo layout

```
apps/
  web/          Next.js 15 dashboard
  desktop/      Tauri v2 scan agent
packages/
  config/       eslint, tsconfig, tailwind presets
  types/        shared types + tier flags
  db/           Drizzle schema (PostgreSQL)
decisions/      ADRs
docs/           architecture, scanning ethics, phase log
```

## Tier matrix

| Tier | Cloud | Auth | History | Reports | Multi-tenant |
|------|-------|------|---------|---------|--------------|
| Personal | — | — | — | — | — |
| Workstation | ✓ | ✓ | ✓ | — | — |
| Consultant | ✓ | ✓ | ✓ | ✓ | — |
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ |

## Secrets (Doppler)

```powershell
doppler setup --project sniffoutpro --config dev
doppler run -- pnpm --filter @sniffoutpro/web dev
```

No `.env` files are committed. See `doppler.yaml` for project stub.

## Local database

```powershell
supabase start
```

Default Postgres: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

## Ethical use

Read [docs/SCANNING.md](docs/SCANNING.md) before running any scan. You must own or have written authorization for all targets.

## Development phases

Phase 0 (scaffold) → **Gate G1** → Phase 1 (core infra) → … → Phase 6 (ship).

See [docs/PHASE-LOG.md](docs/PHASE-LOG.md) for execution evidence.
