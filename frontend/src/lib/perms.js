// Mirror of the backend RBAC matrix for UI gating (server always re-checks).
const OPERATIONAL = ["ADMIN", "PAYMENT_OPS", "COMPLIANCE", "RISK", "FINANCE"];
const PERMS = {
  "exception:assign": OPERATIONAL,
  "exception:transition": OPERATIONAL,
  "exception:remediate": OPERATIONAL,
  "exception:comment": OPERATIONAL,
  "evidence:create": OPERATIONAL,
  "exception:verify": ["ADMIN", "COMPLIANCE", "RISK"],
  "package:generate": ["ADMIN", "COMPLIANCE"],
  "audit:read": ["ADMIN", "COMPLIANCE", "AUDITOR"],
};

export function can(role, action) {
  return (PERMS[action] || []).includes(role);
}
