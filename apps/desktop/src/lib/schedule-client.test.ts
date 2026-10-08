import { describe, expect, it } from 'vitest';
import { scheduleTargets } from './schedule-client.js';

describe('scheduleTargets', () => {
  it('splits targets on spaces and commas', () => {
    expect(scheduleTargets('127.0.0.1, 10.0.0.2')).toEqual(['127.0.0.1', '10.0.0.2']);
  });

  it('drops blank targets', () => {
    expect(scheduleTargets('  ,  ')).toEqual([]);
  });
});
