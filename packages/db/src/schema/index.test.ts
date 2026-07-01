import { describe, expect, it } from 'vitest';
import { scanRuns, findings, organizations } from './index.js';

describe('db schema', () => {
  it('exports core tables', () => {
    expect(scanRuns).toBeDefined();
    expect(findings).toBeDefined();
    expect(organizations).toBeDefined();
  });
});
