import type { AppDatabase } from "@/db/database";
import type { Customer, Order } from "@/domain/refunds/types";
import type { SupportCustomerOption, SupportOrderOption } from "@/domain/support/context";
import type { PortalOrderLookup } from "@/domain/support/types";
import { createSqliteCustomerRepository, createSqliteOrderRepository } from "@/repositories/sqlite";
import { InvalidSupportContextError } from "@/services/support/support-session.service";

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

const PORTAL_LOOKUP_ERROR = "We could not find a matching order for that email.";

export async function listPortalOrdersByEmail(db: AppDatabase, email: string): Promise<PortalOrderLookup> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@") || normalized.length > 320) {
    throw new InvalidSupportContextError(PORTAL_LOOKUP_ERROR);
  }

  const customer = await createSqliteCustomerRepository(db).findByEmail(normalized);
  if (!customer) throw new InvalidSupportContextError(PORTAL_LOOKUP_ERROR);
  const orders = await createSqliteOrderRepository(db).listForCustomer(customer.id);
  if (orders.length === 0) throw new InvalidSupportContextError(PORTAL_LOOKUP_ERROR);

  return {
    customerName: customer.name,
    orders: orders.map(toOrderOption),
  };
}
