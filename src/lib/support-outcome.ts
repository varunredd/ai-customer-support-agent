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

  return null;
}
