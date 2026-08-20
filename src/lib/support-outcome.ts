import type { PersistedAgentEvent } from "@/domain/agent/types";

export type SupportOutcome =
  | {
      kind: "APPROVED";
      amountCents: number;
      refundId: string | null;
      title: string;
      description: string;
    }
  | {
      kind: "DENIED";
      amountCents: 0;
      refundId: null;
      title: string;
      description: string;
    }
  | {
      kind: "PENDING_APPROVAL";
      amountCents: number;
      refundId: null;
      approvalId: string | null;
      title: string;
      description: string;
    }
  | {
      kind: "ESCALATED";
      amountCents: 0;
      refundId: null;
      escalationId: string | null;
      title: string;
      description: string;
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstDenialReason(metadata: Record<string, unknown>): string | null {
  const reasons = metadata.denialReasons;
  if (!Array.isArray(reasons)) return null;
  const first = reasons.find((reason): reason is string => typeof reason === "string" && reason.trim().length > 0);
  if (!first) return null;
  const separator = first.indexOf(":");
  return separator >= 0 ? first.slice(separator + 1).trim() : first.trim();
}

export function supportOutcomeFromEvent(event: PersistedAgentEvent): SupportOutcome | null {
  const metadata = event.metadata;
  if (!metadata) return null;

  if (event.type === "DECISION") {
    const decision = metadata.decision;
    if (decision === "DENY") {
      return {
        kind: "DENIED",
        amountCents: 0,
        refundId: null,
        title: "Refund not eligible",
        description: firstDenialReason(metadata) ?? "This request does not meet the active refund policy.",
      };
    }
    if (decision === "APPROVE" && typeof metadata.refundAmountCents === "number") {
      return {
        kind: "APPROVED",
        amountCents: metadata.refundAmountCents,
        refundId: null,
        title: "Refund eligible",
        description: "The request passed the deterministic refund-policy checks.",
      };
    }
  }

  if (event.type === "REFUND_EXECUTION" && event.status === "SUCCESS") {
    const refund = asRecord(metadata.refund);
    const amountCents = refund && typeof refund.amountCents === "number" ? refund.amountCents : null;
    if (amountCents === null) return null;
    return {
      kind: "APPROVED",
      amountCents,
      refundId: refund && typeof refund.id === "string" ? refund.id : null,
      title: "Refund completed",
      description: "The approved refund was recorded successfully.",
    };
  }

  if (event.type === "REFUND_EXECUTION" && metadata.status === "PENDING_APPROVAL") {
    const evaluation = asRecord(metadata.evaluation);
    const amountCents = evaluation && typeof evaluation.refundAmountCents === "number"
      ? evaluation.refundAmountCents
      : 0;
    return {
      kind: "PENDING_APPROVAL",
      amountCents,
      refundId: null,
      approvalId: typeof metadata.approvalId === "string" ? metadata.approvalId : null,
      title: "Manager approval required",
      description: "This refund passed policy checks but exceeds the automatic approval limit. A support manager will review it.",
    };
  }

  if (event.type === "ESCALATION") {
    return {
      kind: "ESCALATED",
      amountCents: 0,
      refundId: null,
      escalationId: typeof metadata.escalationId === "string" ? metadata.escalationId : null,
      title: "A specialist will take it from here",
      description: "This request was handed to a human support specialist. You will receive an update on this order.",
    };
  }

  return null;
}

export function supportOutcomeFromWorkspace(workspace: {
  policyChecks: Array<{ passed: boolean; summary: string }>;
  pendingApprovalId: string | null;
  escalation: { id: string; summary: string } | null;
  refundedCents: number;
}): SupportOutcome | null {
  if (workspace.escalation) {
    return {
      kind: "ESCALATED",
      amountCents: 0,
      refundId: null,
      escalationId: workspace.escalation.id,
      title: "A specialist will take it from here",
      description: workspace.escalation.summary,
    };
  }
  if (workspace.pendingApprovalId) {
    return {
      kind: "PENDING_APPROVAL",
      amountCents: 0,
      refundId: null,
      approvalId: workspace.pendingApprovalId,
      title: "Manager approval required",
      description: "This refund passed policy checks but exceeds the automatic approval limit. A support manager will review it.",
    };
  }
  if (workspace.policyChecks.length === 0) return null;
  const blocked = workspace.policyChecks.find((check) => !check.passed);
  if (blocked) {
    return {
      kind: "DENIED",
      amountCents: 0,
      refundId: null,
      title: "Refund not eligible",
      description: blocked.summary,
    };
  }
  return {
    kind: "APPROVED",
    amountCents: workspace.refundedCents,
    refundId: null,
    title: workspace.refundedCents > 0 ? "Refund completed" : "Refund eligible",
    description: workspace.refundedCents > 0
      ? "The approved refund was recorded successfully."
      : "The request passed the deterministic refund-policy checks.",
  };
}
