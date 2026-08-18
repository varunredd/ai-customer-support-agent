import type { Customer, Order } from "@/domain/refunds/types";

export interface SupportCustomerOption {
  id: string;
  name: string;
  email: string;
  accountStatus: Customer["accountStatus"];
  riskLevel: Customer["riskLevel"];
}

export interface SupportOrderOption {
  id: string;
  status: Order["status"];
  currency: Order["currency"];
  totalPaidCents: number;
  refundedCents: number;
  placedAt: string;
  deliveredAt: string | null;
  itemNames: string[];
}
