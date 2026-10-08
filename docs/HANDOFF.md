# SniffOutPro — resume here

**Date:** 2026-10-08  
**Plan:** `docs/plans/2026-10-08-0723-feat-finish-sniffoutpro-plan.md`  
**Progress:** `docs/progress.md`  
**Repo:** this folder. The old path under `C:\Users\alkur\Projects` is gone. Do not use it.

Do not re-scaffold. Do not spawn the July multi-agent swarm in `docs/MULTI-AGENT-HANDOFF.md`. That handoff is history. One implementer, one unit at a time. Ask before each commit. Do not push or change the live site until Boss asks.

## What is already built locally

Sign-in, cloud reads locked to a signed-in user, per-user tier, desktop schedules, consultant PDF reports, organization invites on the website, and a daily vulnerability-feed job that pages a window of at most 120 days. That work is on `feat/signed-in-scans-schedules-reports`, including `de71c2d`. The first signed-in API call saves the person before the tier is read. Migrations `0002` through `0005` are applied on the local Postgres container. They are not applied to the live database. `0005` keeps one membership per person in an organization.

A local desktop scan needs no account. The first scan creates that computer's database. The unsigned installer is `C:\AI\labs\scratch\sniffoutpro-installer\SniffOutPro_0.0.0_x64-setup.exe`. `pnpm local` creates the local website database.

## Later, only if the base app earns it

Paid checkout and Supabase sign-in are not next. Add them only if the base app is functional and caters to a market. A signed installer still needs a Windows certificate. The unsigned installer above is already built. Rust is installed. Live scans still need Nmap from its vendor.

## Resume prompt

```
Continue SniffOutPro from docs/plans/2026-10-08-0723-feat-finish-sniffoutpro-plan.md.
Read the Goal Capsule, then docs/progress.md, then the next unfinished unit.
Do not re-scaffold. Do not add Stripe or Supabase sign-in unless the base app is functional and caters to a market.
Ask before committing. Do not push or deploy.
```
