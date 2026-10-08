import { describe, expect, it } from 'vitest';
import { canInvite, canReport, canSchedule, removesOnlyAdmin, scansVisibleTo } from './access.js';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('organization access', () => {
  it('hides another organization from an admin of A', () => {
    const visible = scansVisibleTo(
      [
        { id: 'scan-a', orgId: ORG_A },
        { id: 'scan-b', orgId: ORG_B },
        { id: 'scan-none', orgId: null },
      ],
      [ORG_A],
    );
    expect(visible.map((row) => row.id)).toEqual(['scan-a']);
  });

  it('lets an analyst read and schedule, but not invite', () => {
    expect(canSchedule('analyst')).toBe(true);
    expect(canReport('analyst')).toBe(true);
    expect(canInvite('analyst')).toBe(false);
  });

  it('refuses removing the only admin', () => {
    expect(
      removesOnlyAdmin({
        existingRole: 'admin',
        nextRole: 'viewer',
        adminUserIds: ['admin-1'],
        memberUserId: 'admin-1',
      }),
    ).toBe(true);
    expect(
      removesOnlyAdmin({
        existingRole: 'admin',
        nextRole: 'viewer',
        adminUserIds: ['admin-1', 'admin-2'],
        memberUserId: 'admin-1',
      }),
    ).toBe(false);
  });

  it('refuses schedules and reports for a viewer', () => {
    expect(canSchedule('viewer')).toBe(false);
    expect(canReport('viewer')).toBe(false);
    expect(canInvite('viewer')).toBe(false);
  });
});
