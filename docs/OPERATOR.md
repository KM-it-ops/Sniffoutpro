# SniffOutPro — operator notes

The finish plan is `docs/plans/2026-10-08-0723-feat-finish-sniffoutpro-plan.md`. Progress is `docs/progress.md`.

## What not to do

- Do not re-scaffold.
- Do not commit `.env` files, tokens, or the database password.
- Do not run a live network scan in CI.
- Do not apply migrations to the live database, push, or deploy until Boss asks.
- Do not start paid checkout without a Stripe account, or a signed installer without a Windows certificate.

## Checks

From the repo root:

```powershell
pnpm turbo run typecheck lint test
pnpm --filter @sniffoutpro/web test:e2e
pnpm --filter @sniffoutpro/desktop test
```

The website health check stays public. Cloud scan routes require a signed-in user.
