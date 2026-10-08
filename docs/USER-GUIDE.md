# SniffOutPro — using the scanner

This tool identifies hosts and known vulnerabilities on a network you are allowed to test. It does not exploit them, and it does not attack a target. The website never scans a network.

## Install

The desktop app is the scanner. A signed Windows installer is not available until a code-signing certificate is in place. Until then, run the desktop app from the project with the steps in `docs/DEMO-G2.md`.

The website shows history, reports, and organizations after you sign in.

## Consent

Before a scan, check the authorization box. The wording is the consent record. A scheduled scan runs only when a stored consent already covers those targets. If it does not, the desktop skips the job.

## Scan on your computer

On the desktop screen:

1. Enter the targets you are allowed to test.
2. Check the authorization box.
3. Leave **Use lab fixture (no live nmap required)** on for the sample scan, or turn it off for a live scan of an authorized target.
4. Click **Run scan**.

A lab fixture scan still runs with no account.

## Schedules

On the same screen, enter a whole number of minutes (at least 1) and click **Save schedule**. You must be signed in to the cloud, and you must have checked authorization.

**Run due schedules** runs saved jobs whose time has arrived, and only when stored consent covers their targets. It follows the private-target checkbox on the screen. Uncheck that box and a scheduled scan of a private or loopback address is refused. After a job runs, the next time moves forward by that many minutes. If one job fails, the others still run, and the failed job keeps its current next time.

**Load schedules** lists your jobs. Each one can be updated, turned off, or turned back on. Update uses the targets and interval currently on the screen, and it changes only the job you click. The next run moves to that new interval.

## Sync

Sign in on the desktop with the same account you use on the website, then click **Sync to cloud dashboard**. Someone who is not signed in cannot read or upload cloud scans. A person with no organization can open a scan they uploaded. Someone else cannot.

## Reports

On the website, open Reports after you sign in. A consultant can save a client and a report template, rename them, attach a PNG logo, and download a PDF. The PDF includes the client name, the template name when you pick one, the logo, and the scan’s findings. After the logo is saved for that client, a later download uses it without attaching the file again. A workstation account cannot download reports. A client or template from another organization is refused.

## Organizations

On the website, open Organizations after you sign in. An admin can create an organization and invite a member by email. Inviting someone who is already a member changes their role. The only admin cannot be removed that way. An analyst cannot invite. Each organization sees only its own scans.
