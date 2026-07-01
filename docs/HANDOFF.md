# SniffOutPro — Agent Handoff

**Date:** 2026-06-26  
**Phase:** 3 complete in code | **Production:** partially wired, **DB broken on Vercel**  
**Repo:** `C:\Users\alkur\Projects\Sniffoutpro`  
**Prior session:** [prod wiring attempt](c64755c5-f480-42c0-b386-63e7a8be6d19)

---

## Stop here — read this first

The last agent **did not finish production DB wiring**. Do not redeploy blindly. Fix env + verify before more deploy churn.

### Current production symptom

```text
GET /api/trpc/scans.list → 500
Error: connect ECONNREFUSED 127.0.0.1:54322
```

That means **runtime `DATABASE_URL` is empty or unset** on Vercel, so the app falls back to local Docker Postgres.

| Endpoint | Status |
|----------|--------|
| `GET /api/health` | OK |
| `GET /api/trpc/health.ping` | OK |
| `scans.sync` without token | OK (auth gate) |
| `scans.list` (any) | **500** — localhost fallback |

**URL:** https://sniffoutpro-web.vercel.app  
**Vercel:** `km-it-ops-projects` / `sniffoutpro-web` / `prj_91LH9zPHQ7hPnt44AR15SeapkMVF`

---

## What the last agent did (and what went wrong)

### Done

- Installed Supabase agent skills: `npx skills add supabase/agent-skills` → `.agents/skills/supabase*`
- Confirmed DB provider is **Supabase** (not Neon). Local dev still uses Docker `:54322`.
- Ran `pnpm --filter @sniffoutpro/db db:migrate` against Supabase pooler **:6543** — migrations applied.
- Added `prepare: false` to `packages/db/src/client.ts` (required for Supabase transaction pooler).
- Added lazy DB init: `apps/web/src/lib/db.ts` + updated `apps/web/src/app/api/trpc/[trpc]/route.ts` (may not be deployed).
- Vercel env vars exist (names only): `DATABASE_URL`, `SNIFFOUT_SYNC_TOKEN`, `SNIFFOUT_TIER`, `SUPABASE_URL`
- Sync token on disk: `.local/sync-token.txt` (gitignored)
- Desktop prod env: `apps/desktop/.env.production.local` with `VITE_WEB_URL` + `VITE_SYNC_TOKEN`

### Broken / unreliable

1. **`DATABASE_URL` on Vercel** — likely set incorrectly. PowerShell treats `&` in `?pgbouncer=true&sslmode=require` as a command separator when piping to `vercel env add`. Use **`vercel env update NAME production --yes --value 'FULL_URL'`** (single-quoted) or set in dashboard UI.
2. **Vercel Root Directory = `apps/web`** — causes path bugs. Vercel looks for `web/.next` at repo root. Current workaround copies `apps/web/.next` → `web/.next` in build command (`apps/web/vercel.json`). Builds succeed; runtime may still serve stale bundles if redeploy was interrupted.
3. **`fix-vercel-root.mjs`** — PATCH API script exists but couldn't find `auth.json` token file; `vercel whoami` works via CLI session.
4. **Deploy thrashing** — multiple failed/successful deploys; last full deploy may have been interrupted by user.
5. **No git commits** — entire repo still untracked on `main`.

### Security

Boss exposed Supabase DB password in a screenshot/Notepad. **Rotate password in Supabase dashboard** and update Vercel `DATABASE_URL` after rotation.

---

## Correct fix (do this in order)

### 1. Set `DATABASE_URL` correctly (dashboard is safest)

Supabase → Project `nwzcfwduwddkkvqlbfqo` → Connect → **Transaction pooler** (port **6543**):

```text
postgresql://postgres.nwzcfwduwddkkvqlbfqo:<PASSWORD>@aws-1-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require
```

URL-encode password special chars (`/`, `*`, `,`, `!`, etc.).

**Vercel dashboard** → sniffoutpro-web → Settings → Environment Variables → Production → edit `DATABASE_URL`.

CLI (PowerShell — quote the whole value):

```powershell
$db = 'postgresql://postgres.nwzcfwduwddkkvqlbfqo:<URL_ENCODED_PASSWORD>@aws-1-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require'
vercel env update DATABASE_URL production --yes --value $db --scope km-it-ops-projects
```

### 2. Verify env before deploy

```powershell
vercel env pull .local/vercel-production.env --environment=production --yes --scope km-it-ops-projects
# Open file — DATABASE_URL must NOT be empty and must contain "supabase"
```

Or hit prod after redeploy:

```powershell
curl "https://sniffoutpro-web.vercel.app/api/trpc/scans.list?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22limit%22%3A1%7D%7D%7D"
# Must NOT say 127.0.0.1:54322
```

### 3. Deploy (pick ONE path)

**Option A — recommended:** Reset Root Directory to repo root.

1. Vercel dashboard → General → Root Directory → **clear / set to `.`**
2. Restore root `vercel.json`:

```json
{
  "buildCommand": "pnpm turbo run build --filter=@sniffoutpro/web",
  "installCommand": "pnpm install",
  "framework": "nextjs",
  "outputDirectory": "apps/web/.next"
}
```

3. Delete `apps/web/vercel.json` copy-hack.
4. `vercel deploy --prod --yes --scope km-it-ops-projects`

**Option B — keep `apps/web` root:** Keep `apps/web/vercel.json` copy-hack. Less clean; known to produce runtime module errors if copy step is wrong.

### 4. Smoke test

```powershell
$token = (Get-Content .local\sync-token.txt -Raw).Trim()
node scripts/verify-production.mjs https://sniffoutpro-web.vercel.app $token
```

Gate: all four checks pass, especially `scans.list`.

### 5. Optional

- `SUPABASE_ANON_KEY` on Vercel (JWT auth only)
- Desktop E2E: fixture scan → sync → live dashboard

---

## Vercel env reference

| Variable | Purpose | Set? |
|----------|---------|------|
| `DATABASE_URL` | Supabase pooler :6543 | **Broken / wrong** |
| `SNIFFOUT_SYNC_TOKEN` | Protects `scans.sync` | Yes (see `.local/sync-token.txt`) |
| `SNIFFOUT_TIER` | `WORKSTATION` | Yes |
| `SUPABASE_URL` | `https://nwzcfwduwddkkvqlbfqo.supabase.co` | Yes |
| `SUPABASE_ANON_KEY` | JWT auth | Not set |

---

## Local dev (unchanged)

```powershell
$env:Path = "C:\Program Files (x86)\Nmap;C:\Program Files\Nmap;$env:USERPROFILE\.cargo\bin;C:\Program Files\nodejs;" + $env:Path
cd C:\Users\alkur\Projects\Sniffoutpro
docker compose -f docker/docker-compose.dev.yml up -d
pnpm --filter @sniffoutpro/web dev          # :3000
pnpm --filter @sniffoutpro/desktop tauri dev # :1420
```

Local tests: `pnpm turbo run typecheck lint test` → 29/29.

---

## Uncommitted files of note

| Path | Why |
|------|-----|
| `apps/web/src/lib/db.ts` | Lazy DB init — avoids module-load localhost fallback |
| `apps/web/src/app/api/trpc/[trpc]/route.ts` | Uses `getDb()` |
| `packages/db/src/client.ts` | `prepare: false` for pooler |
| `apps/web/vercel.json` | Copy-hack build for `apps/web` root |
| `scripts/set-vercel-supabase-env.mjs` | Env setter (use `--value`, not stdin on Windows) |
| `scripts/fix-vercel-root.mjs` | API patch to reset root dir |
| `scripts/verify-production.mjs` | Smoke test |
| `scripts/prod-bootstrap.ps1` | Local bootstrap |
| `.agents/skills/supabase*` | Installed agent skills |
| `docs/PRODUCTION.md` | Deploy docs (partially contradictory — trust this HANDOFF) |

---

## Architecture (unchanged)

Web = Next.js control plane. Scans run on desktop only (ADR 003). Sync via tRPC `scans.sync` + bearer token.

See `docs/DEMO-G2.md`, `docs/PHASE-LOG.md`, `decisions/`.

---

## Gates

| Gate | Status |
|------|--------|
| G1 Scaffold | PASSED |
| G2 Tier 1 MVP | PASSED (local) |
| G2 Production E2E | **BLOCKED** — Vercel DB |
| G3 Consultant/Admin | Not started |

---

## Next agent: do NOT

- Do not run more deploys until `DATABASE_URL` is verified non-empty and non-localhost.
- Do not pipe connection strings with `&` through PowerShell without quoting.
- Do not commit `.local/*` or env files with secrets.
- Do not use `vercel redeploy` expecting new code — it recycles old build artifacts.

## Next agent: DO

1. Fix `DATABASE_URL` in Vercel (dashboard).
2. Pick root-dir strategy (A recommended).
3. Deploy once.
4. Run `verify-production.mjs`.
5. Tell Boss to rotate exposed DB password.
