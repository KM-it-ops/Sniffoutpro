export type ScheduledJob = {
  id: string;
  cron: string;
  targets: string[];
  intensity: 'light' | 'standard' | 'deep';
  enabled: boolean;
  nextRunAt: string | null;
};

export type StoredConsent = {
  targets: string[];
};

export function consentCoversTargets(jobTargets: string[], scopes: StoredConsent[]): boolean {
  return scopes.some((scope) => jobTargets.every((target) => scope.targets.includes(target)));
}

export function minuteInterval(value: string): string | null {
  const trimmed = value.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function nextRunAfter(cron: string, now: Date): Date | null {
  const minutes = minuteInterval(cron);
  if (minutes === null) {
    return null;
  }
  return new Date(now.getTime() + Number(minutes) * 60_000);
}

export function scheduledScanRequest(
  job: ScheduledJob,
  consentText: string,
  allowPrivateOverride: boolean,
): {
  targets: string;
  intensity: ScheduledJob['intensity'];
  consentText: string;
  allowPrivateOverride: boolean;
} {
  return {
    targets: job.targets.join(' '),
    intensity: job.intensity,
    consentText,
    allowPrivateOverride,
  };
}

export function isJobDue(job: ScheduledJob, now: Date): boolean {
  if (!job.enabled) {
    return false;
  }
  if (job.nextRunAt === null) {
    return true;
  }
  return new Date(job.nextRunAt).getTime() <= now.getTime();
}

export async function runDueJobs(input: {
  jobs: ScheduledJob[];
  scopes: StoredConsent[];
  now: Date;
  run: (job: ScheduledJob) => Promise<void>;
  onRan?: (job: ScheduledJob, nextRunAt: Date | null) => Promise<void>;
}): Promise<{ ran: string[]; skipped: string[]; failed: { id: string; message: string }[] }> {
  const ran: string[] = [];
  const skipped: string[] = [];
  const failed: { id: string; message: string }[] = [];
  for (const job of input.jobs) {
    if (!isJobDue(job, input.now)) {
      continue;
    }
    if (!consentCoversTargets(job.targets, input.scopes)) {
      skipped.push(job.id);
      continue;
    }
    try {
      await input.run(job);
    } catch (caught) {
      failed.push({
        id: job.id,
        message: caught instanceof Error ? caught.message : 'The scheduled scan failed.',
      });
      continue;
    }
    if (input.onRan !== undefined) {
      await input.onRan(job, nextRunAfter(job.cron, input.now));
    }
    ran.push(job.id);
  }
  return { ran, skipped, failed };
}
