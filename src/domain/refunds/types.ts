export type AccountStatus = "ACTIVE" | "SUSPENDED";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type OrderStatus = "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED";
export type ItemCondition = "UNOPENED" | "OPENED" | "USED" | "DAMAGED";
export type RefundReason =
  | "CHANGED_MIND"
  | "DAMAGED"
  | "WRONG_ITEM"
  | "NOT_AS_DESCRIBED"
  | "LATE_DELIVERY";

export interface Customer {
  id: string;
  name: string;
  email: string;
  accountStatus: AccountStatus;
  riskLevel: RiskLevel;
  lifetimeOrders: number;
  lifetimeRefunds: number;
  createdAt: string;
}

export interface OrderItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  finalSale: boolean;
  refundable: boolean;
}

export interface Order {
  id: string;
  customerId: string;
  status: OrderStatus;
  currency: "USD";
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalPaidCents: number;
  refundedCents: number;
  placedAt: string;
  deliveredAt: string | null;
  items: OrderItem[];
}

export interface RefundRequest {
  customerId: string;
  orderId: string;
  itemId: string;
  quantity: number;
  reason: RefundReason;
  condition: ItemCondition;
  requestedAt: string;
}

export type RefundDecision = "APPROVE" | "DENY";

export interface RuleCheck {
  code: string;
  passed: boolean;
  summary: string;
  evidence: Record<string, string | number | boolean | null>;
}

export interface RefundEvaluation {
  decision: RefundDecision;
  refundAmountCents: number;
  checks: RuleCheck[];
  denialReasons: string[];
}
