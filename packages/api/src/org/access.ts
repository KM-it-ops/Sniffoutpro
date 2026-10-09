export type OrgRole = 'admin' | 'analyst' | 'viewer';

export function scansVisibleTo<T extends { orgId: string | null }>(
  rows: T[],
  orgIds: readonly string[],
): T[] {
  const allowed = new Set(orgIds);
  return rows.filter((row) => row.orgId !== null && allowed.has(row.orgId));
}

export function canInvite(role: OrgRole): boolean {
  return role === 'admin';
}

export function removesOnlyAdmin(input: {
  existingRole: string | null | undefined;
  nextRole: string;
  adminUserIds: readonly string[];
  memberUserId: string;
}): boolean {
  if (input.existingRole !== 'admin' || input.nextRole === 'admin') {
    return false;
  }
  return input.adminUserIds.every((id) => id === input.memberUserId);
}

export function canSchedule(role: OrgRole): boolean {
  return role === 'admin' || role === 'analyst';
}

export function canSync(role: OrgRole): boolean {
  return role === 'admin' || role === 'analyst';
}

export function canReport(role: OrgRole): boolean {
  return role === 'admin' || role === 'analyst';
}

export function parseOrgRole(value: string | null | undefined): OrgRole | null {
  if (value === 'admin' || value === 'analyst' || value === 'viewer') {
    return value;
  }
  return null;
}
