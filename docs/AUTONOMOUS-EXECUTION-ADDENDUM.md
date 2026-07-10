# SniffOutPro — AUTONOMOUS EXECUTION ADDENDUM

> Generated 2026-07-09 from greenfield spec + autonomous-execution skill.
> Appends to `docs/GREENFIELD-SPEC.md`. Does not replace the governing spec.

## EXECUTION MODE (mandatory — overrides default agent behavior)

You are in FULL EXECUTION MODE. You do not "plan and stop." You run commands,
read output, fix failures, and re-run until the current phase exit criteria pass
or you hit a HARD BLOCKER.

RULE: Never mark a phase complete without pasted command output proving success.
RULE: Never say "tests should pass" — run them and show the summary line.
RULE: Never skip a failing test with @skip, .only, or commented assertions.
RULE: Never advance to the next phase without reporting to Boss and clearing the gate.
RULE: If stuck after 3 distinct fix attempts on the same failure, write
docs/BLOCKER-YYYY-MM-DD.md and HALT with root cause + options.

## VERIFY-FIX LOOP (run after every meaningful change)

```
LOOP:
  1. pnpm turbo run typecheck
  2. pnpm turbo run lint
  3. pnpm turbo run test
  4. IF phase ≥ 3 AND web surface exists:
       pnpm --filter @sniffoutpro/web test:e2e
  5. IF any step fails:
       a. Read full stderr/stdout — do not guess
       b. Fix smallest correct change
       c. GOTO LOOP
  6. IF all pass → record in docs/PHASE-LOG.md:
       timestamp | phase | commands run | exit codes | commit hash
```

Minimum once per phase before gate request. Minimum once before any deploy step.

## DEBUG PROTOCOL

1. Reproduce: run the single failing command in isolation.
2. Classify: BUILD | TEST | RUNTIME | ENV | FLAKE
3. Evidence: error message, file:line, last git diff hunk.
4. Fix root cause — not symptom suppression.
5. Re-run full VERIFY-FIX LOOP for affected scope.
6. Add regression test if the bug was non-trivial.

FORBIDDEN: disabling lint rules, weakening assertions, `--no-verify`, `@ts-ignore`, mocking away the feature under test.

## PHASE EXIT CRITERIA

### Phase 0 / Gate G1

- [x] `pnpm turbo run typecheck lint test` exits 0 (historically passed; re-verify on resume)

### Phase 1

- [x] Fixture XML parses; migration applies; `health.ping` via HTTP

### Phase 2 / Gate G2

- [x] Fixture scan → 3 topology nodes + Log4j on 127.0.0.1:8080
- [x] Desktop E2E + VERIFY green

### Phase 3 / Gate G2b — **CLEARED** (2026-07-10 live probe)

- [x] Local: sync, dashboard, Playwright, verify script present
- [x] Production: health + `scans.list` return 200 with data
- [x] Audit hardening in progress (fail-closed auth, guardrails, indexes) — redeploy after VERIFY

### Phase 4+

Per greenfield §14. G2b cleared — start Phase 4 after VERIFY + migrate + redeploy.

## DEPLOY PROTOCOL

PRE-DEPLOY:

1. Git working tree clean except intentional changes
2. Full VERIFY-FIX LOOP green
3. Secrets verified: `vercel env ls --scope km-it-ops-projects` shows `DATABASE_URL`, `SNIFFOUT_SYNC_TOKEN`, `SNIFFOUT_TIER`, `SUPABASE_URL`; then smoke `scans.list` must not ENOTFOUND

DEPLOY TARGETS:

- Web: Vercel project `sniffoutpro-web` (scope `km-it-ops-projects`), Root Directory `apps/web`, `outputFileTracingRoot` set in `apps/web/next.config.ts` — **no** root `vercel.json` copy hacks
- DB: Supabase project `nwzcfwduwddkkvqlbfqo`, transaction pooler `:6543`
- Desktop: Tauri build with `apps/desktop/.env.production.local` (gitignored)

POST-DEPLOY SMOKE:

```bash
node scripts/verify-production.mjs https://sniffoutpro-web.vercel.app <sync-token>
# Must pass: health, trpc ping, sync auth gate, scans.list with token
```

Record URLs/paths in docs/PHASE-LOG.md.

## CI BABYSIT MODE

After every push:

1. `gh run list --branch main --limit 5`
2. `gh run watch`
3. IF failed: `gh run view <id> --log-failed` → fix → commit → push → repeat
4. Do not open PR until required checks green

## SESSION HANDOFF

When context limit approaches OR Boss starts new chat, write docs/HANDOFF.md (see current file).

Resume prompt: "Continue SniffOutPro from docs/HANDOFF.md. Execute addendum VERIFY-FIX LOOP. Do not re-scaffold."

## HARD BLOCKERS (HALT — do not spin)

- Missing / invalid credentials after setup attempted (Supabase pooler tenant ENOTFOUND, empty DATABASE_URL, rotated password not updated on Vercel)
- Human gate awaiting Boss approval (G2b production, G3–G6)
- Same failure after 3 distinct fix attempts
- Security/legal ambiguity (consent, exploit tooling, secret exposure)

## SOFT BLOCKERS (work around)

- Docker Desktop stopped → skip local Postgres integration tests; rely on fixture unit tests + prior evidence
- Optional `SUPABASE_ANON_KEY` missing → keep sync-token auth path; JWT auth deferred
- Cross-OS Tauri signing on Windows-only host → document signed macOS build as future gate item
- pnpm not on PATH in some shells → prepend `C:\nvm4w\nodejs`

## COMMIT DISCIPLINE

- Conventional commits: feat/fix/test/chore/docs/ci
- One logical fix per commit during debug loops
- Do NOT commit unless Boss asked OR phase boundary / CI fix
- Never commit secrets, .env, or sensitive scan/output data

## REPORTING FORMAT

```
## Phase [N] Status
**Verdict:** GREEN | BLOCKED | AWAITING GATE Gx
**Evidence:** [command → exit summary]
**Commits:** [hashes]
**Deploy:** [URL or not yet]
**Blockers:** [none | list]
**Gate request:** [Gx ready | not ready because ...]
```

## INITIALIZATION (this session)

1. Governing spec `docs/GREENFIELD-SPEC.md` + this addendum loaded.
2. Toolchain: Node 22.22.1, pnpm 9.15.0, Rust/cargo 1.96.0, Docker present (daemon may be stopped).
3. Repo is **not** empty — resume from Phase 3 / Gate G2b; do not re-scaffold.
4. Enter VERIFY-FIX LOOP continuously within current phase.
5. Request human gates only with evidence.

DEFAULT: Execute autonomously within the current phase.
STOP: Human gates, HARD BLOCKERS, or ship prep complete.
