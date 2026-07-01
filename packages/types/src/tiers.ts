import { z } from 'zod';

export const TierEnum = z.enum(['PERSONAL', 'WORKSTATION', 'CONSULTANT', 'ADMIN']);
export type Tier = z.infer<typeof TierEnum>;

export const TIER_FEATURES = {
  PERSONAL: {
    cloudSync: false,
    auth: false,
    history: false,
    schedules: false,
    reports: false,
    multiTenant: false,
  },
  WORKSTATION: {
    cloudSync: true,
    auth: true,
    history: true,
    schedules: true,
    reports: false,
    multiTenant: false,
  },
  CONSULTANT: {
    cloudSync: true,
    auth: true,
    history: true,
    schedules: true,
    reports: true,
    multiTenant: false,
  },
  ADMIN: {
    cloudSync: true,
    auth: true,
    history: true,
    schedules: true,
    reports: true,
    multiTenant: true,
  },
} as const satisfies Record<Tier, Record<string, boolean>>;

export function hasTierFeature(tier: Tier, feature: keyof (typeof TIER_FEATURES)['PERSONAL']): boolean {
  return TIER_FEATURES[tier][feature];
}

export function tierAtLeast(current: Tier, required: Tier): boolean {
  const order: Tier[] = ['PERSONAL', 'WORKSTATION', 'CONSULTANT', 'ADMIN'];
  return order.indexOf(current) >= order.indexOf(required);
}
