import type { Customer, Order } from "@/domain/refunds/types";
import type { TenantBranding } from "@/domain/tenant/branding";

export type SupportSessionStatus = "OPEN" | "CLOSED";
export type SupportMessageRole = "CUSTOMER" | "AGENT";
export type CustomerReturnStatus =
  | "NONE"
  | "PARTIAL_REFUND"
  | "REFUND_APPROVED"
  | "PENDING_APPROVAL";

export interface SupportSession {
  id: string;
  customerId: string;
  orderId: string;
  status: SupportSessionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessage {
  id: string;
  sessionId: string;
  runId: string | null;
  role: SupportMessageRole;
  content: string;
  createdAt: string;
}

export interface SupportPolicyWindow {
  windowDays: number;
  deliveredAt: string | null;
  daysElapsed: number | null;
  daysRemaining: number | null;
  expiresAt: string | null;
  open: boolean;
}

export interface CustomerPolicyCheck {
  code: string;
  passed: boolean;
  summary: string;
}

export interface SupportEscalationSummary {
  id: string;
  ticketNumber: string;
  summary: string;
  priority: "NORMAL" | "HIGH";
  status: "OPEN" | "RESOLVED";
  createdAt: string;
  slaMessage: string;
}

export interface SupportWorkspace {
  refundedCents: number;
  remainingCents: number;
  returnStatus: CustomerReturnStatus;
  policyWindow: SupportPolicyWindow;
  policyVersion: string | null;
  policyChecks: CustomerPolicyCheck[];
  pendingApprovalId: string | null;
  escalation: SupportEscalationSummary | null;
}

export interface SupportSessionDetail {
  session: SupportSession;
  customer: Customer;
  order: Order;
  messages: SupportMessage[];
  workspace: SupportWorkspace;
  branding: TenantBranding;
}

export interface PortalOrderLookup {
  customerName: string;
  orders: Array<{
    id: string;
    status: Order["status"];
    currency: Order["currency"];
    totalPaidCents: number;
    refundedCents: number;
    placedAt: string;
    deliveredAt: string | null;
    itemNames: string[];
  }>;
}
