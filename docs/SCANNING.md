# Scanning ethics and scope

SniffOutPro is for **authorized vulnerability assessment only**.

## Before your first scan

1. Confirm you **own** the targets or have **written authorization**.
2. Type the consent confirmation shown in the desktop app.
3. Review target scope — private/reserved ranges require explicit override.

## Intensity levels

| Level | nmap profile | Use case |
|-------|--------------|----------|
| light | Fast host discovery, top ports | Quick recon |
| standard | `-sV`, common scripts | Default lab scans |
| deep | `-sV -O`, SSL scripts | Full assessment |

## Limits

- Default max CIDR: `/16` without Boss override.
- Max job size: 65536 ports × 256 hosts without confirmation modal.
- **No exploit execution** — detection only.
- nuclei: safe templates tagged `cve`, `misconfig` only.

## Logging

Every scan run stores an immutable authorization record with targets and consent timestamp.
