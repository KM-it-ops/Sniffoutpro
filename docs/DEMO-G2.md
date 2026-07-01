# G2 Demo — Tier 1 Desktop Scan (Boss Lab)

Authorized scanning only. Use targets you own or have written permission to test.

## Prerequisites

| Tool | Check |
|------|-------|
| Rust | `rustc --version` (≥1.77) |
| Node / pnpm | `node -v`, `pnpm -v` |
| Docker Postgres (optional web API) | `docker ps --filter name=sniffoutpro-postgres` |
| nmap (optional) | `nmap --version` — **7.95 installed** |

## Fixture demo (no live nmap)

1. From repo root:

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;C:\Program Files\nodejs;" + $env:Path
pnpm --filter @sniffoutpro/desktop tauri dev
```

2. In the desktop app:
   - Targets: `127.0.0.1` (any value is fine for fixture)
   - Check **authorization consent**
   - Leave **Use lab fixture** enabled
   - Click **Run scan**

3. Expected results:
   - Progress bar reaches 100%
   - Topology graph shows **3 hosts** (127.0.0.1, 192.168.1.10, 192.168.1.20)
   - Findings list includes **Log4j / CVE-2021-44228** on 127.0.0.1:8080
   - Click a node → host detail panel updates

4. SQLite persistence: `%APPDATA%\com.sniffoutpro.desktop\sniffoutpro-tier1.db` (via Tauri AppData)

## Live nmap demo (when nmap installed)

1. Uncheck **Use lab fixture**
2. Targets: `127.0.0.1` or your lab host
3. Consent + **Run scan**
4. Desktop spawns `nmap -sV -oX - <targets>` and parses XML through scan-engine

## Verify from CLI

```powershell
pnpm turbo run typecheck lint test
pnpm --filter @sniffoutpro/scan-engine test:coverage
```

## Gate G2 criteria

- [x] Fixture scan pipeline (parse → correlate → persist)
- [x] Topology ≥3 nodes from fixture
- [x] scan-engine coverage ≥85%
- [x] Automated fixture→SQLite E2E (`apps/desktop/src/lib/g2-e2e.test.ts`)
- [x] Automated cloud sync + dashboard E2E (Playwright `e2e/dashboard.spec.ts`)
- [x] G2 gate (automated verification)
- [ ] nmap on PATH (optional; fixture satisfies CI/dev)
