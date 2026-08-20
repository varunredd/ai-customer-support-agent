import type { AppDatabase } from "@/db/database";
import type { Customer, Order } from "@/domain/refunds/types";
import type { SupportMessage, SupportSession, SupportSessionDetail } from "@/domain/support/types";
import { createSqliteCustomerRepository, createSqliteOrderRepository } from "@/repositories/sqlite";
import { SupportSessionRepository } from "@/repositories/support-session.repository";
import { consumeSupportLaunch, createSessionAccessToken, type SupportLaunchClaims } from "@/security/support-access";
import { getSupportBranding } from "@/services/support/support-branding.service";
import { buildSupportWorkspace } from "@/services/support/support-workspace.service";

export class SupportSessionNotFoundError extends Error {
  readonly code = "SUPPORT_SESSION_NOT_FOUND";
}

export class InvalidSupportContextError extends Error {
  readonly code = "INVALID_SUPPORT_CONTEXT";
}

function toSessionDetail(
  db: AppDatabase,
  input: { session: SupportSession; customer: Customer; order: Order; messages: SupportMessage[] },
): SupportSessionDetail {
  return {
    ...input,
    workspace: buildSupportWorkspace(db, {
      customerId: input.customer.id,
      order: input.order,
      messages: input.messages,
    }),
    branding: getSupportBranding(db),
  };
}

export async function createSupportSession(
  db: AppDatabase,
  input: { customerId: string; orderId: string; accessTokenHash?: string | null },
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
  return toSessionDetail(db, { session, customer, order, messages: [welcome] });
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

  return toSessionDetail(db, { session, customer, order, messages: sessions.listMessages(sessionId) });
}


const PORTAL_LOOKUP_ERROR = "We could not find a matching order for that email.";

export async function createPortalSupportSession(
  db: AppDatabase,
  input: { email: string; orderId: string },
): Promise<{ detail: SupportSessionDetail; accessToken: string }> {
  const email = input.email.trim().toLowerCase();
  const orderId = input.orderId.trim();
  if (!email.includes("@") || email.length > 320 || !orderId) {
    throw new InvalidSupportContextError(PORTAL_LOOKUP_ERROR);
  }

  const customers = createSqliteCustomerRepository(db);
  const orders = createSqliteOrderRepository(db);
  const customer = await customers.findByEmail(email);
  if (!customer) throw new InvalidSupportContextError(PORTAL_LOOKUP_ERROR);
  const order = await orders.findForCustomer(orderId, customer.id);
  if (!order) throw new InvalidSupportContextError(PORTAL_LOOKUP_ERROR);

  const sessionAccess = createSessionAccessToken();
  const sessions = new SupportSessionRepository(db);
  const session = sessions.create({
    customerId: customer.id,
    orderId: order.id,
    accessTokenHash: sessionAccess.hash,
  });
  const welcome = sessions.appendMessage({
    sessionId: session.id,
    role: "AGENT",
    content: `Hi ${customer.name.split(" ")[0]}. I can help with order ${order.id}. Tell me what happened and I'll check the refund policy.`,
  });
  return {
    detail: toSessionDetail(db, { session, customer, order, messages: [welcome] }),
    accessToken: sessionAccess.token,
  };
}

export async function createHostedSupportSession(
  db: AppDatabase,
  claims: SupportLaunchClaims,
): Promise<{ detail: SupportSessionDetail; accessToken: string }> {
  const customers = createSqliteCustomerRepository(db);
  const orders = createSqliteOrderRepository(db);
  const customer = await customers.findById(claims.customerId);
  const order = await orders.findForCustomer(claims.orderId, claims.customerId);
  if (!customer || !order) {
    throw new InvalidSupportContextError("Signed support launch references a missing customer or customer-owned order.");
  }

  const sessionAccess = createSessionAccessToken();
  const sessions = new SupportSessionRepository(db);
  const create = db.transaction(() => {
    consumeSupportLaunch(db, claims);
    const session = sessions.create({
      customerId: claims.customerId,
      orderId: claims.orderId,
      accessTokenHash: sessionAccess.hash,
    });
    const welcome = sessions.appendMessage({
      sessionId: session.id,
      role: "AGENT",
      content: `Hi ${customer.name.split(" ")[0]}. I can help with order ${order.id}. Tell me what happened and I'll check the refund policy.`,
    });
    return { session, welcome };
  });

  const created = create.immediate();
  return {
    detail: toSessionDetail(db, { session: created.session, customer, order, messages: [created.welcome] }),
    accessToken: sessionAccess.token,
  };
}
