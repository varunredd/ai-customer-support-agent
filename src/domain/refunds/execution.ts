import type { RefundEvaluation, RefundRequest } from "@/domain/refunds/types";

export interface ExecuteRefundInput {
  idempotencyKey: string;
  runId?: string;
  request: RefundRequest;
}

export interface RefundRecord {
  id: string;
  idempotencyKey: string;
  runId: string | null;
  customerId: string;
  orderId: string;
  itemId: string;
  quantity: number;
  reason: RefundRequest["reason"];
  condition: RefundRequest["condition"];
  amountCents: number;
  currency: "USD";
  status: "COMPLETED";
  policyVersion: string | null;
  createdAt: string;
}

export type ExecuteRefundResult =
  | {
      status: "COMPLETED";
      idempotentReplay: boolean;
      refund: RefundRecord;
      evaluation: RefundEvaluation;
      approvalId?: null;
    }
  | {
      status: "DENIED";
      idempotentReplay: false;
      refund: null;
      evaluation: RefundEvaluation;
      approvalId?: null;
    }
  | {
      status: "PENDING_APPROVAL";
      idempotentReplay: boolean;
      refund: null;
      evaluation: RefundEvaluation;
      approvalId: string;
      autoApproveMaxCents: number;
    };
