# SniffOutPro — resume here

**Date:** 2026-10-08  
**Plan:** `docs/plans/2026-10-08-0723-feat-finish-sniffoutpro-plan.md`  
**Progress:** `docs/progress.md`  
**Repo:** this folder. The old path under `C:\Users\alkur\Projects` is gone. Do not use it.

Do not re-scaffold. Do not spawn the July multi-agent swarm in `docs/MULTI-AGENT-HANDOFF.md`. That handoff is history. One implementer, one unit at a time. Ask before each commit. Do not push or change the live site until Boss asks.

## What is already built locally

Sign-in, cloud reads locked to a signed-in user, per-user tier, desktop schedules, consultant PDF reports, organization invites on the website, and a daily vulnerability-feed job that pages a window of at most 120 days. Migrations `0002` through `0005` are files only. They are not applied to the live database. `0005` keeps one membership per person in an organization.

## Stopped until Boss provides them

- Paid checkout: needs a Stripe account and the four prices. This is a final step.
- Signed Windows installer: needs a code-signing certificate. This is a final step. An unsigned installer also needs the Rust toolchain, which is not installed. The unsigned fixture demo is still the desktop path in `docs/DEMO-G2.md` and `docs/USER-GUIDE.md`.
- Live sign-in: needs Supabase auth turned on and the public keys.

## Resume prompt

```
Continue SniffOutPro from docs/plans/2026-10-08-0723-feat-finish-sniffoutpro-plan.md.
Read the Goal Capsule, then docs/progress.md, then the next unfinished unit.
Do not re-scaffold. Do not start Stripe or code signing until Boss supplies the account or certificate.
Ask before committing. Do not push or deploy.
```
