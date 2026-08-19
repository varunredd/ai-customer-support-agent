export interface RefundPolicyRule {
  code: string;
  title: string;
  text: string;
}

export interface RefundPolicyDefinition {
  version: string;
  refundWindowDays: number;
  rules: RefundPolicyRule[];
}

export const DEFAULT_REFUND_POLICY: RefundPolicyDefinition = {
  version: "2026-08-18",
  refundWindowDays: 30,
  rules: [
    { code: "ACCOUNT_ACTIVE", title: "Account must be active", text: "Refunds cannot be processed for suspended customer accounts." },
    { code: "RISK_NOT_HIGH", title: "High-risk accounts are ineligible", text: "Accounts currently classified as HIGH risk are not eligible for automated refunds." },
    { code: "ORDER_OWNERSHIP", title: "Order ownership", text: "The requesting customer must own the order." },
    { code: "ORDER_DELIVERED", title: "Delivered orders only", text: "Refund requests are accepted only after the order has been delivered." },
    { code: "WITHIN_WINDOW", title: "Refund window", text: "A refund request must be submitted within the active policy's configured calendar-day window after delivery." },
    { code: "ITEM_REFUNDABLE", title: "Refundable item", text: "Items explicitly marked non-refundable are never eligible." },
    { code: "NOT_FINAL_SALE", title: "No final-sale refunds", text: "Final-sale merchandise cannot be refunded." },
    { code: "VALID_QUANTITY", title: "Valid quantity", text: "The requested refund quantity must be at least one and cannot exceed the remaining unrefunded purchased quantity." },
    { code: "CONDITION_ALLOWED", title: "Condition requirement", text: "Changed-mind, late-delivery, and not-as-described returns must be unopened. Damaged or wrong-item claims may be opened or damaged, but not consumed/used." },
    { code: "REMAINING_BALANCE", title: "No over-refunding", text: "The item refund cannot make cumulative refunds exceed the order amount paid. Shipping is excluded from automated refunds." },
  ],
};

// Compatibility export used by tests and static documentation. Runtime refund decisions
// load the active persisted policy through RefundPolicyRepository.
export const REFUND_POLICY = DEFAULT_REFUND_POLICY;
