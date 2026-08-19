import { createHmac, randomUUID } from "node:crypto";

interface RefundNotifyInput {
  refundId: string;
  customerId: string;
  orderId: string;
  itemId: string;
  quantity: number;
  amountCents: number;
  reason: string;
  condition: string;
}

export async function notifyEcommerceRefundCompleted(input: RefundNotifyInput) {
  const baseUrl = process.env.ECOMMERCE_BASE_URL?.trim().replace(/\/$/, "");
  const secret = process.env.BUSINESS_INTEGRATION_SECRET?.trim();
  if (!baseUrl || !secret || secret.length < 32) {
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
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${eventId}.${rawBody}`)
    .digest("hex");

  try {
    const response = await fetch(`${baseUrl}/api/integrations/jobform/refund-completed`, {
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
