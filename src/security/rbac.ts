import type { StaffRole } from "@/domain/auth/types";

export const STAFF_PERMISSIONS = [
  "policy:publish",
  "policy:edit",
  "refund:approve",
  "refund:view",
  "runs:view",
  "escalations:manage",
  "integrations:manage",
  "team:manage",
  "audit:view",
  "analytics:view",
] as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<StaffRole, readonly StaffPermission[]> = {
  PLATFORM_ADMIN: STAFF_PERMISSIONS,
  MERCHANT_ADMIN: [
    "policy:publish",
    "policy:edit",
    "refund:approve",
    "refund:view",
    "runs:view",
    "escalations:manage",
    "integrations:manage",
    "team:manage",
    "audit:view",
    "analytics:view",
  ],
  SUPPORT_MANAGER: [
    "policy:edit",
    "refund:approve",
    "refund:view",
    "runs:view",
    "escalations:manage",
    "audit:view",
    "analytics:view",
  ],
  SUPPORT_AGENT: ["refund:view", "runs:view", "escalations:manage"],
  VIEWER: ["refund:view", "runs:view", "audit:view", "analytics:view"],
};

export function roleHasPermission(role: StaffRole, permission: StaffPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsForRole(role: StaffRole): StaffPermission[] {
  return [...ROLE_PERMISSIONS[role]];
}

/** Roles that tenant admins can assign when inviting staff. */
export const TENANT_ASSIGNABLE_ROLES = [
  "MERCHANT_ADMIN",
  "SUPPORT_MANAGER",
  "SUPPORT_AGENT",
  "VIEWER",
] as const satisfies readonly StaffRole[];

export function isTenantAssignableRole(role: string): role is (typeof TENANT_ASSIGNABLE_ROLES)[number] {
  return (TENANT_ASSIGNABLE_ROLES as readonly string[]).includes(role);
}
