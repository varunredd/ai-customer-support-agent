import { randomUUID } from "node:crypto";
import type { AppDatabase } from "@/db/database";
import type { OutboundWebhookEvent } from "@/domain/integrations/types";
import { operationalLog } from "@/lib/observability/system-logger";
import { OutboundWebhookRepository } from "@/repositories/outbound-webhook.repository";
import { signIntegrationPayload } from "@/security/integration-signature";
import { resolveTenantId } from "@/services/tenant/tenant-context.service";
import { resolveWebhookCredentials } from "@/services/integrations/tenant-integration.service";

export function enqueueOutboundWebhook(
  db: AppDatabase,
  input: { eventType: OutboundWebhookEvent; eventKey: string; payload: Record<string, unknown>; tenantId?: string },
) {
  const tenantId = resolveTenantId(db, input.tenantId);
  const webhook = resolveWebhookCredentials(db, tenantId);
  if (!webhook.configured || !webhook.events.includes(input.eventType)) return null;
  return new OutboundWebhookRepository(db, tenantId).enqueue({
    eventType: input.eventType,
    eventKey: input.eventKey,
    payload: input.payload,
  });
}

export async function drainOutboundWebhooks(
  db: AppDatabase,
  options: { limit?: number; fetchImpl?: typeof fetch } = {},
) {
  const repository = new OutboundWebhookRepository(db);
  const pending = repository.listDispatchable(new Date().toISOString(), options.limit ?? 25);
  const fetchImpl = options.fetchImpl ?? fetch;
  let sent = 0;
  let failed = 0;

  for (const delivery of pending) {
    const webhook = resolveWebhookCredentials(db, delivery.tenantId);
    if (!webhook.configured || !webhook.url || !webhook.secret) {
      const dead = repository.markFailed(delivery.id, "Webhook destination is not configured.");
      failed += 1;
      if (dead) {
        operationalLog({
          severity: "ERROR",
          source: "outbound-webhooks",
          code: "WEBHOOK_DEAD",
          message: "Outbound merchant webhook exhausted retries.",
          metadata: { deliveryId: delivery.id, eventType: delivery.eventType },
          tenantId: delivery.tenantId,
        }, db);
      }
      continue;
    }
    const rawBody = JSON.stringify({
      type: delivery.eventType,
      id: delivery.id,
      createdAt: delivery.createdAt,
      data: delivery.payload,
    });
    const timestamp = String(Date.now());
    const eventId = `wh_${randomUUID()}`;
    const signature = signIntegrationPayload({
      secret: webhook.secret,
      timestamp,
      eventId,
      rawBody,
    });
    try {
      const response = await fetchImpl(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-jobform-timestamp": timestamp,
          "x-jobform-event-id": eventId,
          "x-jobform-signature": `sha256=${signature}`,
          "x-jobform-event": delivery.eventType,
        },
        body: rawBody,
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const dead = repository.markFailed(delivery.id, text.slice(0, 500) || `HTTP ${response.status}`, response.status);
        failed += 1;
        if (dead) {
          operationalLog({
            severity: "ERROR",
            source: "outbound-webhooks",
            code: "WEBHOOK_DEAD",
            message: "Outbound merchant webhook exhausted retries.",
            metadata: { deliveryId: delivery.id, eventType: delivery.eventType },
            tenantId: delivery.tenantId,
          }, db);
        }
        continue;
      }
      repository.markSent(delivery.id, response.status);
      sent += 1;
      operationalLog({
        severity: "INFO",
        source: "outbound-webhooks",
        code: "WEBHOOK_SENT",
        message: "Outbound merchant webhook delivered.",
        metadata: { deliveryId: delivery.id, eventType: delivery.eventType },
      }, db);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook delivery failed.";
      const dead = repository.markFailed(delivery.id, message);
      failed += 1;
      if (dead) {
        operationalLog({
          severity: "ERROR",
          source: "outbound-webhooks",
          code: "WEBHOOK_DEAD",
          message: "Outbound merchant webhook exhausted retries.",
          metadata: { deliveryId: delivery.id, eventType: delivery.eventType },
          tenantId: delivery.tenantId,
        }, db);
      }
    }
  }

  return { processed: pending.length, sent, failed };
}

export function emitOutboundWebhook(
  db: AppDatabase,
  input: { eventType: OutboundWebhookEvent; eventKey: string; payload: Record<string, unknown>; tenantId?: string },
) {
  try {
    const queued = enqueueOutboundWebhook(db, input);
    if (queued) void drainOutboundWebhooks(db, { limit: 10 });
    return queued;
  } catch {
    return null;
  }
}
