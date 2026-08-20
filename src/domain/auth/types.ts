export const STAFF_ROLES = [
  "PLATFORM_ADMIN",
  "MERCHANT_ADMIN",
  "SUPPORT_MANAGER",
  "SUPPORT_AGENT",
  "VIEWER",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export type StaffUserStatus = "ACTIVE" | "DISABLED";

export interface StaffUser {
  id: string;
  tenantId: string;
  email: string;
  role: StaffRole;
  status: StaffUserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StaffSession {
  userId: string;
  email: string;
  tenantId: string;
  role: StaffRole;
  exp: number;
}
