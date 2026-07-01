import { describe, expect, it } from 'vitest';
import { scoreRisk } from '../risk/score.js';

describe('scoreRisk', () => {
  it('scores critical network findings higher than local info', () => {
    const critical = scoreRisk({ cvssScore: 10, severity: 'critical', exposure: 'network' });
    const info = scoreRisk({ severity: 'info', exposure: 'local' });
    expect(critical).toBeGreaterThan(info);
    expect(critical).toBeLessThanOrEqual(100);
  });
});
