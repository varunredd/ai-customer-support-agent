import type { AppDatabase } from "@/db/database";
import type { Order } from "@/domain/refunds/types";
import type {
  CustomerReturnStatus,
  SupportEscalationSummary,
  SupportMessage,
  SupportPolicyWindow,
  SupportWorkspace,
} from "@/domain/support/types";
import { addUtcDays, differenceInCalendarDays } from "@/lib/date";
import { customerPolicyChecksFromUnknown } from "@/lib/customer-policy-checks";
import { AgentRunRepository } from "@/repositories/agent-run.repository";
import { RefundApprovalRepository } from "@/repositories/refund-approval.repository";
import { RefundPolicyRepository } from "@/repositories/refund-policy.repository";
import { SupportEscalationRepository } from "@/repositories/support-escalation.repository";

function latestRunId(messages: SupportMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const runId = messages[index]?.runId;
    if (runId) return runId;
  }
  return null;
}

function ticketNumber(id: string): string {
  const compact = id.replace(/^esc_/, "ESC-");
  return compact.length <= 14 ? compact : `${compact.slice(0, 12)}…`;
}

function escalationSummary(escalation: {
  id: string;
  summary: string;
  priority: "NORMAL" | "HIGH";
  status: "OPEN" | "RESOLVED";
  createdAt: string;
}): SupportEscalationSummary {
  return {
    id: escalation.id,
    ticketNumber: ticketNumber(escalation.id),
    summary: escalation.summary,
    priority: escalation.priority,
    status: escalation.status,
    createdAt: escalation.createdAt,
    slaMessage: escalation.priority === "HIGH"
      ? "A specialist typically replies within 2 hours."
      : "A specialist typically replies within 1 business day.",
  };
}

export function buildPolicyWindow(order: Order, windowDays: number, nowIso = new Date().toISOString()): SupportPolicyWindow {
  const deliveredAt = order.deliveredAt;
  if (!deliveredAt) {
    return {
      windowDays,
      deliveredAt: null,
      daysElapsed: null,
      daysRemaining: null,
      expiresAt: null,
      open: false,
    };
  }

  const daysElapsed = differenceInCalendarDays(nowIso, deliveredAt);
  const daysRemaining = windowDays - daysElapsed;
  return {
    windowDays,
    deliveredAt,
    daysElapsed,
    daysRemaining,
    expiresAt: addUtcDays(deliveredAt, windowDays),
    open: daysRemaining >= 0,
  };
}

export function deriveReturnStatus(input: {
  refundedCents: number;
  totalPaidCents: number;
  pendingApproval: boolean;
}): CustomerReturnStatus {
  if (input.pendingApproval) return "PENDING_APPROVAL";
  if (input.refundedCents >= input.totalPaidCents && input.totalPaidCents > 0) return "REFUND_APPROVED";
  if (input.refundedCents > 0) return "PARTIAL_REFUND";
  return "NONE";
}

export function buildSupportWorkspace(
  db: AppDatabase,
  input: { customerId: string; order: Order; messages: SupportMessage[] },
  nowIso = new Date().toISOString(),
): SupportWorkspace {
  const policy = new RefundPolicyRepository(db).getActiveOrNull();
  const runIds = new Set(input.messages.map((message) => message.runId).filter((id): id is string => Boolean(id)));
  const pending = new RefundApprovalRepository(db).findLatestPendingForOrder(input.customerId, input.order.id);
  const escalation = new SupportEscalationRepository(db).findLatestForOrder(input.customerId, input.order.id);
  const sessionEscalation = escalation && runIds.has(escalation.runId) ? escalation : null;
  const runId = latestRunId(input.messages);
  const run = runId ? new AgentRunRepository(db).findById(runId, true) : null;
  const policyCheckEvent = [...(run?.events ?? [])].reverse().find((event) => event.type === "POLICY_CHECK");
  const decisionEvent = [...(run?.events ?? [])].reverse().find((event) => event.type === "DECISION");
  const policyVersion = typeof policyCheckEvent?.metadata?.policyVersion === "string"
    ? policyCheckEvent.metadata.policyVersion
    : typeof decisionEvent?.metadata?.policyVersion === "string"
      ? decisionEvent.metadata.policyVersion
      : policy?.version ?? null;

  return {
    refundedCents: input.order.refundedCents,
    remainingCents: Math.max(0, input.order.totalPaidCents - input.order.refundedCents),
    returnStatus: deriveReturnStatus({
      refundedCents: input.order.refundedCents,
      totalPaidCents: input.order.totalPaidCents,
      pendingApproval: Boolean(pending),
    }),
    policyWindow: buildPolicyWindow(input.order, policy?.refundWindowDays ?? 30, nowIso),
    policyVersion,
    policyChecks: customerPolicyChecksFromUnknown(policyCheckEvent?.metadata?.checks),
    pendingApprovalId: pending?.id ?? null,
    escalation: sessionEscalation ? escalationSummary(sessionEscalation) : null,
  };
}
