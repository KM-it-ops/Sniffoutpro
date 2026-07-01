# ADR 002: Tier Feature Flags

## Status

Accepted (Phase 0)

## Context

SniffOutPro ships four product tiers in one codebase: Personal, Workstation, Consultant, Admin. Features must be gated without dead menu stubs or security holes.

## Decision

1. **Single source of truth**: `packages/types/src/tiers.ts` defines `TierEnum`, `TIER_FEATURES`, `hasTierFeature()`, and `tierAtLeast()`.
2. **Dual enforcement**:
   - **UI**: Route guards and conditional navigation based on active tier.
   - **API**: tRPC middleware rejects procedures above the caller's tier.
3. **Tier capabilities**:

| Tier | Storage | Auth | History | Schedules | Reports | Multi-tenant |
|------|---------|------|---------|-----------|---------|--------------|
| PERSONAL | SQLite | No | No | No | No | No |
| WORKSTATION | Supabase | Yes | Yes | Yes | No | No |
| CONSULTANT | Supabase | Yes | Yes | Yes | Yes | No |
| ADMIN | Supabase | Yes | Yes | Yes | Yes | Yes |

4. **PostHog feature flags** mirror tier gates for Tier 2+ analytics (no raw IPs in events).

## Consequences

- No feature UI renders for disabled tiers.
- Tier 1 runs fully offline with embedded LibSQL/SQLite.
- Commercial pricing (Gate G5) maps directly to tier enum.

## Alternatives considered

- **Separate repos per tier**: Rejected — maintenance burden.
- **Runtime-only UI hiding**: Rejected — API must enforce gates.
