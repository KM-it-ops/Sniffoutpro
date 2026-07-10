# Production DB troubleshooting

Recurring Gate **G2b** class: web health is up, but `scans.list` fails with a Postgres/pooler error.

Confirmation step after any fix:

```powershell
$token = (Get-Content .local\sync-token.txt -Raw).Trim()
node scripts/verify-production.mjs https://sniffoutpro-web.vercel.app $token
```

---

## Symptom → cause → fix

### 1. `ECONNREFUSED 127.0.0.1:54322`

|           |                                                                                                                                                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cause** | `DATABASE_URL` missing under Vercel; code fell back to local Supabase.                                                                                                                                                 |
| **Fix**   | Set Production `DATABASE_URL` to the Supabase **transaction pooler** (`:6543`). Code in `apps/web/src/lib/db.ts` now **throws** if URL is missing under `VERCEL` / production — do not reintroduce localhost fallback. |

### 2. `ENOTFOUND` / `tenant/user postgres.<ref> not found`

|           |                                                                                                                                                                                        |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cause** | Project paused/deleted, password rotated without updating Vercel, wrong pooler host, or malformed user `postgres.<project-ref>`.                                                       |
| **Fix**   | Supabase dashboard → project active → Connect → **Transaction pooler** port **6543** → copy URI → URL-encode password special chars → set Vercel Production `DATABASE_URL` → redeploy. |

### 3. Rotated password not updated on Vercel

|           |                                                                                                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cause** | Supabase DB password rotated (or exposed) but Vercel still has the old URL.                                                                                                   |
| **Fix**   | Rotate in Supabase if needed → copy new pooler URL → `vercel env update DATABASE_URL production` (or dashboard) → redeploy. See secret-rotation notes in GREENFIELD-SPEC §11. |

### 4. Wrong pooler host / port

|           |                                                                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cause** | Session pooler (`:5432`) or direct host used instead of transaction pooler (`:6543`). App uses `postgres({ prepare: false })` for PgBouncer. |
| **Fix**   | Host like `aws-*-*.pooler.supabase.com`, port **6543**, query `pgbouncer=true&sslmode=require`.                                              |

### 5. Malformed / URL-unencoded password

|           |                                                                                          |
| --------- | ---------------------------------------------------------------------------------------- |
| **Cause** | Password contains `@`, `#`, `/`, `+`, etc. and was pasted raw into the URI.              |
| **Fix**   | URL-encode the password segment only (PowerShell: `[uri]::EscapeDataString($password)`). |

### 6. Localhost leaking into prod

|           |                                                                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Cause** | Root `vercel.json` copy-hack or missing `outputFileTracingRoot` caused wrong env resolution historically.                                |
| **Fix**   | Keep `outputFileTracingRoot` in `apps/web/next.config.ts`. Do **not** add root vercel copy hacks. Fail-closed `db.ts` guard must remain. |

---

## Checklist (≈5 minutes)

1. Supabase project not paused.
2. Transaction pooler URL on `:6543`, password encoded.
3. Vercel Production env: `DATABASE_URL`, `SNIFFOUT_SYNC_TOKEN`, `SNIFFOUT_TIER`, `SUPABASE_URL`.
4. Redeploy if env was updated outside a deploy.
5. `scripts/verify-production.mjs` all green; `scans.list` returns data (not 500).
