# SniffOutPro

Authorized vulnerability assessment on your own computer.

A local scan needs no account. The first scan creates a database on that computer. The website never scans a network, and this tool does not exploit a target.

## Use it

| You want                          | Do this                                                                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| A scan on this computer           | Run the desktop app. Check authorization. Leave the lab fixture on for a sample, or turn it off for a live scan of a target you are allowed to test. |
| A local website database          | From the repo, run `pnpm local`. It starts Postgres and applies the migrations. You do not fill in a connection string.                              |
| Several people, or a live website | Not yet. Cloud accounts and paid checkout wait until this app is functional and has a market.                                                        |

Live scans need [Nmap](https://nmap.org/) installed. A lab fixture scan does not.

Package an unsigned Windows installer from the repo:

```powershell
pnpm package:desktop
```

A signed installer waits on a Windows code-signing certificate.

## Run the project

```powershell
pnpm install
pnpm turbo run typecheck lint test
pnpm --filter @sniffoutpro/desktop dev
pnpm local
```

The desktop preview is `http://127.0.0.1:1420/`. The website is `http://127.0.0.1:3000/`.

## Layout

```
apps/desktop     Tauri scanner. Local database. No account.
apps/web         Next.js site for history, reports, and organizations.
packages/api     tRPC API and tier checks.
packages/db      Postgres schema and the local scanner database.
packages/scan-engine
docs             User guide, operator notes, and the finish plan.
```

Read [docs/USER-GUIDE.md](docs/USER-GUIDE.md) for consent, schedules, and the Supabase steps for a later live site. Read [docs/SCANNING.md](docs/SCANNING.md) before any live scan.

## Rules

Scan only targets you own or have written permission to test. The health check stays public. Paid checkout and cloud sign-in are not part of the base app.
