import type { Customer } from "@/domain/refunds/types";

export const customers: Customer[] = [
  { id: "cus_001", name: "Maya Patel", email: "maya@example.com", accountStatus: "ACTIVE", riskLevel: "LOW", lifetimeOrders: 8, lifetimeRefunds: 1, createdAt: "2025-01-12T09:00:00Z" },
  { id: "cus_002", name: "Noah Williams", email: "noah@example.com", accountStatus: "ACTIVE", riskLevel: "LOW", lifetimeOrders: 3, lifetimeRefunds: 0, createdAt: "2025-02-20T09:00:00Z" },
  { id: "cus_003", name: "Ava Chen", email: "ava@example.com", accountStatus: "ACTIVE", riskLevel: "MEDIUM", lifetimeOrders: 14, lifetimeRefunds: 3, createdAt: "2024-11-02T09:00:00Z" },
  { id: "cus_004", name: "Ethan Brown", email: "ethan@example.com", accountStatus: "ACTIVE", riskLevel: "LOW", lifetimeOrders: 5, lifetimeRefunds: 0, createdAt: "2025-03-18T09:00:00Z" },
  { id: "cus_005", name: "Sofia Garcia", email: "sofia@example.com", accountStatus: "SUSPENDED", riskLevel: "MEDIUM", lifetimeOrders: 10, lifetimeRefunds: 2, createdAt: "2024-09-12T09:00:00Z" },
  { id: "cus_006", name: "Liam Johnson", email: "liam@example.com", accountStatus: "ACTIVE", riskLevel: "HIGH", lifetimeOrders: 19, lifetimeRefunds: 9, createdAt: "2024-06-10T09:00:00Z" },
  { id: "cus_007", name: "Isabella Martin", email: "isabella@example.com", accountStatus: "ACTIVE", riskLevel: "LOW", lifetimeOrders: 2, lifetimeRefunds: 0, createdAt: "2026-01-05T09:00:00Z" },
  { id: "cus_008", name: "Lucas Thompson", email: "lucas@example.com", accountStatus: "ACTIVE", riskLevel: "MEDIUM", lifetimeOrders: 7, lifetimeRefunds: 2, createdAt: "2025-06-21T09:00:00Z" },
  { id: "cus_009", name: "Mia Anderson", email: "mia@example.com", accountStatus: "ACTIVE", riskLevel: "LOW", lifetimeOrders: 11, lifetimeRefunds: 1, createdAt: "2024-12-29T09:00:00Z" },
  { id: "cus_010", name: "James Wilson", email: "james@example.com", accountStatus: "ACTIVE", riskLevel: "LOW", lifetimeOrders: 6, lifetimeRefunds: 0, createdAt: "2025-07-16T09:00:00Z" },
  { id: "cus_011", name: "Amelia Davis", email: "amelia@example.com", accountStatus: "ACTIVE", riskLevel: "MEDIUM", lifetimeOrders: 16, lifetimeRefunds: 4, createdAt: "2024-08-30T09:00:00Z" },
  { id: "cus_012", name: "Benjamin Moore", email: "ben@example.com", accountStatus: "ACTIVE", riskLevel: "LOW", lifetimeOrders: 4, lifetimeRefunds: 0, createdAt: "2025-10-11T09:00:00Z" },
  { id: "cus_013", name: "Harper Taylor", email: "harper@example.com", accountStatus: "ACTIVE", riskLevel: "LOW", lifetimeOrders: 9, lifetimeRefunds: 1, createdAt: "2025-04-04T09:00:00Z" },
  { id: "cus_014", name: "Henry Jackson", email: "henry@example.com", accountStatus: "ACTIVE", riskLevel: "MEDIUM", lifetimeOrders: 13, lifetimeRefunds: 3, createdAt: "2024-10-23T09:00:00Z" },
  { id: "cus_015", name: "Evelyn White", email: "evelyn@example.com", accountStatus: "ACTIVE", riskLevel: "LOW", lifetimeOrders: 1, lifetimeRefunds: 0, createdAt: "2026-06-12T09:00:00Z" }
];
