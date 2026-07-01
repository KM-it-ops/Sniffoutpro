# ADR 001: Scan Engine Architecture

## Status

Accepted (Phase 0)

## Context

SniffOutPro must discover hosts, identify services, correlate CVEs, and emit progress events without becoming a full Nessus/OpenVAS replacement. Scans must run on authorized targets only, with ethical guardrails and offline Tier 1 support.

## Decision

1. **Execution location**: Scans execute on the **desktop Tauri agent** (Tiers 1–3). The web app is a read-only control plane and visualization layer — it never raw-scans the user's LAN.
2. **Language split**:
   - `packages/scan-engine` (TypeScript): orchestration, target parsing, nmap XML parsing, CVE correlation, risk scoring, scan diffs, progress event emission.
   - `packages/scan-rust` / Tauri commands (Rust): subprocess spawn for nmap/nuclei, stdout streaming, ICMP/TCP probes, system inventory.
3. **Tooling**: nmap is required (`-sV -O --script=ssl-enum-ciphers`). nuclei is optional (safe templates only). Custom TLS probe for cert/cipher analysis.
4. **Persistence**: Every scan run stores targets, authorization record, timestamps, raw + normalized output.
5. **Progress**: Typed `ScanProgressEvent` stream consumed by desktop UI and tRPC subscriptions (Tier 2+).

## Consequences

- CI uses fixture XML/JSON — never real network scans.
- Web cannot import scan-engine for execution; only desktop and API sync paths.
- Phase 1 delivers nmap wrapper POC + Tauri `run_nmap` command before Tier 1 UI.

## Alternatives considered

- **Web-side scanning**: Rejected — violates agent model and browser sandbox limits.
- **All-Rust engine**: Rejected — CVE correlation and business rules fit TypeScript + Drizzle better.
- **OpenVAS integration**: Rejected — out of scope per governing spec.
