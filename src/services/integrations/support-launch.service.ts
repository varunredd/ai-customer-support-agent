import { createHash } from "node:crypto";
import type { AppDatabase } from "@/db/database";
import { createSqliteCustomerRepository, createSqliteOrderRepository } from "@/repositories/sqlite";
import { createSupportLaunchToken } from "@/security/support-access";

export class SupportLaunchContextError extends Error {
  readonly code = "INVALID_SUPPORT_LAUNCH_CONTEXT";
}

export async function createIntegratedSupportLaunch(
  db: AppDatabase,
  input: { customerId: string; orderId: string; integrationEventId: string; baseUrl: string },
) {
  const customer = await createSqliteCustomerRepository(db).findById(input.customerId);
  const order = await createSqliteOrderRepository(db).findForCustomer(input.orderId, input.customerId);
  if (!customer || !order) {
    throw new SupportLaunchContextError("Customer or customer-owned order was not found in canonical support context.");
  }

  const jti = `launch_${createHash("sha256")
    .update(`${input.integrationEventId}:${input.customerId}:${input.orderId}`)
    .digest("hex")}`;
  const token = createSupportLaunchToken({
    customerId: input.customerId,
    orderId: input.orderId,
    jti,
    expiresInSeconds: 300,
  });
  const baseUrl = input.baseUrl.replace(/\/$/, "");

  return {
    launchUrl: `${baseUrl}/support#launch=${encodeURIComponent(token)}`,
    expiresInSeconds: 300,
    customerId: customer.id,
    orderId: order.id,
  };
}
