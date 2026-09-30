export const ROLES = ['ADMIN', 'PAYMENT_OPS', 'COMPLIANCE', 'RISK', 'FINANCE', 'AUDITOR', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

const OPERATIONAL: Role[] = ['ADMIN', 'PAYMENT_OPS', 'COMPLIANCE', 'RISK', 'FINANCE'];

// RBAC matrix. Mirrored for UI gating in frontend/src/lib/perms.js — the
// server is the source of truth and always re-checks.
export const PERMISSIONS = {
  'exception:assign': OPERATIONAL,
  'exception:transition': OPERATIONAL,
  'exception:remediate': OPERATIONAL,
  'exception:comment': OPERATIONAL,
  'evidence:create': OPERATIONAL,
  'exception:verify': ['ADMIN', 'COMPLIANCE', 'RISK'],
  'package:generate': ['ADMIN', 'COMPLIANCE'],
  'package:attest': ['ADMIN', 'COMPLIANCE'],
  'package:countersign': ['ADMIN', 'COMPLIANCE', 'RISK'],
  'audit:read': ['ADMIN', 'COMPLIANCE', 'AUDITOR'],
  'controls:run': ['ADMIN', 'PAYMENT_OPS', 'RISK', 'COMPLIANCE'],
  'signers:manage': ['ADMIN'],
} satisfies Record<string, Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: string | undefined, action: Permission): boolean {
  return !!role && (PERMISSIONS[action] as string[]).includes(role);
}
