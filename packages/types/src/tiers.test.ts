import { describe, expect, it } from 'vitest';
import { tierAtLeast, TierEnum, hasTierFeature } from './tiers.js';

describe('tiers', () => {
  it('orders tiers correctly', () => {
    expect(tierAtLeast('ADMIN', 'PERSONAL')).toBe(true);
    expect(tierAtLeast('PERSONAL', 'WORKSTATION')).toBe(false);
  });

  it('validates tier enum', () => {
    expect(TierEnum.parse('PERSONAL')).toBe('PERSONAL');
  });

  it('gates features by tier', () => {
    expect(hasTierFeature('PERSONAL', 'cloudSync')).toBe(false);
    expect(hasTierFeature('WORKSTATION', 'cloudSync')).toBe(true);
    expect(hasTierFeature('WORKSTATION', 'reports')).toBe(false);
    expect(hasTierFeature('CONSULTANT', 'reports')).toBe(true);
  });
});
