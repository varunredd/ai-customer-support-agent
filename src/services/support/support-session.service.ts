import type { AppDatabase } from "@/db/database";
import type { SupportSessionDetail } from "@/domain/support/types";
import { createSqliteCustomerRepository, createSqliteOrderRepository } from "@/repositories/sqlite";
import { SupportSessionRepository } from "@/repositories/support-session.repository";

export class SupportSessionNotFoundError extends Error {
  readonly code = "SUPPORT_SESSION_NOT_FOUND";
}

export class InvalidSupportContextError extends Error {
  readonly code = "INVALID_SUPPORT_CONTEXT";
}

export async function createSupportSession(
  db: AppDatabase,
  input: { customerId: string; orderId: string },
): Promise<SupportSessionDetail> {
  const customers = createSqliteCustomerRepository(db);
  const orders = createSqliteOrderRepository(db);
  const customer = await customers.findById(input.customerId);
  const order = await orders.findForCustomer(input.orderId, input.customerId);

  if (!customer || !order) {
    throw new InvalidSupportContextError("Customer or customer-owned order was not found.");
  }

  const sessions = new SupportSessionRepository(db);
  const session = sessions.create(input);
  const welcome = sessions.appendMessage({
    sessionId: session.id,
    role: "AGENT",
    content: `Hi ${customer.name.split(" ")[0]}. I can help with order ${order.id}. Tell me what happened and I'll check the refund policy.`,
  });
  return { session, customer, order, messages: [welcome] };
}

export async function getSupportSessionDetail(db: AppDatabase, sessionId: string): Promise<SupportSessionDetail> {
  const sessions = new SupportSessionRepository(db);
  const session = sessions.findById(sessionId);
  if (!session) throw new SupportSessionNotFoundError("Support session was not found.");

  const customers = createSqliteCustomerRepository(db);
  const orders = createSqliteOrderRepository(db);
  const [customer, order] = await Promise.all([
    customers.findById(session.customerId),
    orders.findForCustomer(session.orderId, session.customerId),
  ]);
  if (!customer || !order) {
    throw new InvalidSupportContextError("Persisted support session references missing CRM data.");
  }

  return { session, customer, order, messages: sessions.listMessages(sessionId) };
}
