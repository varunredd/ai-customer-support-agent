import type { Customer, Order } from "@/domain/refunds/types";

export type SupportSessionStatus = "OPEN" | "CLOSED";
export type SupportMessageRole = "CUSTOMER" | "AGENT";

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

export interface SupportSessionDetail {
  session: SupportSession;
  customer: Customer;
  order: Order;
  messages: SupportMessage[];
}
