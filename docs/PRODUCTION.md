# SniffOutPro — Production

## Vercel (3 settings, no hacks)

| Setting | Value |
|---------|-------|
| Root Directory | `apps/web` |
| Install Command | `cd ../.. && pnpm install` |
| Build Command | `cd ../.. && pnpm turbo run build --filter=@sniffoutpro/web` |

No `vercel.json`. No copy-to-`web/.next` workaround. Output is `apps/web/.next` (Next.js default).

Deploy: `vercel deploy --prod --yes --scope km-it-ops-projects`  
If the main URL serves stale code: `vercel promote <deployment-url> --scope km-it-ops-projects --yes`

Set DB URL: `$env:SUPABASE_DB_PASSWORD='...'; node scripts/set-database-url.mjs`

## Database (1 env var)

Vercel → Settings → Environment Variables → Production:

```
DATABASE_URL=postgresql://postgres.<ref>:<password>@<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require
```

URL-encode the password. On Windows, set via dashboard or PowerShell single-quoted string — `&` breaks unquoted CLI args.

Migrate once against the pooler:

```powershell
$env:DATABASE_URL="<pooler-url>"
pnpm --filter @sniffoutpro/db db:migrate
```

Code reads `process.env.DATABASE_URL` in `apps/web/src/lib/db.ts`. No localhost fallback on Vercel.

## Other production env vars

| Variable | Purpose |
|----------|---------|
| `SNIFFOUT_SYNC_TOKEN` | Protects `scans.sync` |
| `SNIFFOUT_TIER` | `WORKSTATION` |
| `SUPABASE_URL` | Optional, for future JWT auth |

## Verify

```powershell
node scripts/verify-production.mjs https://sniffoutpro-web.vercel.app (Get-Content .local/sync-token.txt)
```

## Desktop

`apps/desktop/.env.production.local` needs `VITE_WEB_URL` + `VITE_SYNC_TOKEN` (same as `SNIFFOUT_SYNC_TOKEN`).
