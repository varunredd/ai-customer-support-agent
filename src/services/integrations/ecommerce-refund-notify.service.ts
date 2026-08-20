import { randomUUID } from "node:crypto";
import { getDatabase } from "@/db/database";
import { signIntegrationPayload } from "@/security/integration-signature";
import { resolveCommerceCredentials } from "@/services/integrations/tenant-integration.service";

interface RefundNotifyInput {
  refundId: string;
  customerId: string;
  orderId: string;
  itemId: string;
  quantity: number;
  amountCents: number;
  reason: string;
  condition: string;
  tenantId?: string;
}

export async function notifyEcommerceRefundCompleted(input: RefundNotifyInput) {
  const db = getDatabase();
  const commerce = resolveCommerceCredentials(db, input.tenantId);
  if (!commerce.configured || !commerce.baseUrl || !commerce.secret) {
    return { notified: false as const, reason: "E-commerce integration is not configured." };
  }

  const rawBody = JSON.stringify({
    refundId: input.refundId,
    customerId: input.customerId,
    orderId: input.orderId,
    itemId: input.itemId,
    quantity: input.quantity,
    amountCents: input.amountCents,
    reason: input.reason,
    condition: input.condition,
    returnStatus: "REFUND_APPROVED",
  });
  const timestamp = String(Date.now());
  const eventId = `refund_${randomUUID()}`;
  const signature = signIntegrationPayload({
    secret: commerce.secret,
    timestamp,
    eventId,
    rawBody,
  });

  try {
    const response = await fetch(`${commerce.baseUrl}/api/integrations/jobform/refund-completed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-jobform-timestamp": timestamp,
        "x-jobform-event-id": eventId,
        "x-jobform-signature": `sha256=${signature}`,
        "x-jobform-source": "jobform-refund",
      },
      body: rawBody,
    });
    if (!response.ok) {
      const text = await response.text();
      console.error("[ecommerce-refund-notify]", response.status, text);
      return { notified: false as const, reason: text };
    }
    return { notified: true as const };
  } catch (error) {
    console.error("[ecommerce-refund-notify]", error);
    return { notified: false as const, reason: error instanceof Error ? error.message : "Unknown error" };
  }
}
