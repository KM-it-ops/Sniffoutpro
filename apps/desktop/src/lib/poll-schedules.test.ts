import { describe, expect, it, vi } from 'vitest';
import {
  isJobDue,
  minuteInterval,
  nextRunAfter,
  runDueJobs,
  scheduledScanRequest,
  type ScheduledJob,
} from './poll-schedules';

const now = new Date('2026-10-08T12:00:00.000Z');

function job(overrides: Partial<ScheduledJob> = {}): ScheduledJob {
  return {
    id: 'job-1',
    cron: '60',
    targets: ['127.0.0.1'],
    intensity: 'light',
    enabled: true,
    nextRunAt: '2026-10-08T11:00:00.000Z',
    ...overrides,
  };
}

describe('minuteInterval', () => {
  it('accepts a whole number of minutes', () => {
    expect(minuteInterval(' 60 ')).toBe('60');
  });

  it('rejects zero and words', () => {
    expect(minuteInterval('0')).toBeNull();
    expect(minuteInterval('every hour')).toBeNull();
  });
});

describe('scheduledScanRequest', () => {
  it('keeps the private-target choice instead of forcing it on', () => {
    const request = scheduledScanRequest(job(), 'consent', false);
    expect(request.allowPrivateOverride).toBe(false);
    expect(request.targets).toBe('127.0.0.1');
  });
});

describe('runDueJobs', () => {
  it('skips a due job when consent does not cover its targets', async () => {
    const run = vi.fn();
    const result = await runDueJobs({
      jobs: [job()],
      scopes: [{ targets: ['10.0.0.5'] }],
      now,
      run,
    });
    expect(result.skipped).toEqual(['job-1']);
    expect(result.ran).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it('hands a due job with stored consent to the local runner', async () => {
    const run = vi.fn(async () => undefined);
    const due = job();
    const result = await runDueJobs({
      jobs: [due],
      scopes: [{ targets: ['127.0.0.1', '127.0.0.2'] }],
      now,
      run,
    });
    expect(result.ran).toEqual(['job-1']);
    expect(result.skipped).toEqual([]);
    expect(run).toHaveBeenCalledWith(due);
  });

  it('schedules the next run one interval later', async () => {
    const onRan = vi.fn(async () => undefined);
    const due = job();
    await runDueJobs({
      jobs: [due],
      scopes: [{ targets: ['127.0.0.1'] }],
      now,
      run: async () => undefined,
      onRan,
    });
    const next = nextRunAfter('60', now);
    expect(next?.toISOString()).toBe('2026-10-08T13:00:00.000Z');
    expect(onRan).toHaveBeenCalledWith(due, next);
    expect(isJobDue({ ...due, nextRunAt: next?.toISOString() ?? null }, now)).toBe(false);
  });

  it('continues with the next due job when one scan fails', async () => {
    const onRan = vi.fn(async () => undefined);
    const result = await runDueJobs({
      jobs: [job(), job({ id: 'job-2', targets: ['8.8.8.8'] })],
      scopes: [{ targets: ['127.0.0.1', '8.8.8.8'] }],
      now,
      run: async (item) => {
        if (item.id === 'job-1') {
          throw new Error('private range');
        }
      },
      onRan,
    });
    expect(result.failed).toEqual([{ id: 'job-1', message: 'private range' }]);
    expect(result.ran).toEqual(['job-2']);
    expect(onRan).toHaveBeenCalledTimes(1);
  });
});
