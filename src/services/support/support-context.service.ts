import type { AppDatabase } from "@/db/database";
import type { Customer, Order } from "@/domain/refunds/types";
import type { SupportCustomerOption, SupportOrderOption } from "@/domain/support/context";
import { createSqliteCustomerRepository, createSqliteOrderRepository } from "@/repositories/sqlite";

function toCustomerOption(customer: Customer): SupportCustomerOption {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    accountStatus: customer.accountStatus,
    riskLevel: customer.riskLevel,
  };
}

function toOrderOption(order: Order): SupportOrderOption {
  return {
    id: order.id,
    status: order.status,
    currency: order.currency,
    totalPaidCents: order.totalPaidCents,
    refundedCents: order.refundedCents,
    placedAt: order.placedAt,
    deliveredAt: order.deliveredAt,
    itemNames: order.items.map((item) => item.name),
  };
}

export async function listSupportCustomers(db: AppDatabase): Promise<SupportCustomerOption[]> {
  const customers = await createSqliteCustomerRepository(db).listAll();
  return customers.map(toCustomerOption);
}

export async function listSupportOrdersForCustomer(
  db: AppDatabase,
  customerId: string,
): Promise<SupportOrderOption[]> {
  const customer = await createSqliteCustomerRepository(db).findById(customerId);
  if (!customer) return [];
  const orders = await createSqliteOrderRepository(db).listForCustomer(customerId);
  return orders.map(toOrderOption);
}
