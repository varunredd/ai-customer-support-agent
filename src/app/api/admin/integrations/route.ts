import { randomUUID } from "node:crypto";
import { getDatabase } from "@/db/database";
import { asObject, jsonError, readNonEmptyString } from "@/lib/http";
import { AuditLogRepository } from "@/repositories/audit-log.repository";
import { requireStaffPermission, resolveStaffActorUserId, resolveStaffTenantId } from "@/security/staff-authorization";
import {
  drainOutboundWebhooks,
  enqueueOutboundWebhook,
} from "@/services/integrations/outbound-webhook.service";
import { drainNotificationOutbox } from "@/services/notifications/notification.service";
import { OutboundWebhookRepository } from "@/repositories/outbound-webhook.repository";
import { NotificationOutboxRepository } from "@/repositories/notification-outbox.repository";
import {
  getPublicIntegrationStatus,
  resolveWebhookCredentials,
  saveTenantIntegration,
  TenantIntegrationError,
} from "@/services/integrations/tenant-integration.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireStaffPermission(request, "integrations:manage");
  if (auth instanceof Response) return auth;
  const db = getDatabase();
  const tenantId = resolveStaffTenantId(db, auth);
  return Response.json(
    { integrations: getPublicIntegrationStatus(db, tenantId) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: Request) {
  const auth = requireStaffPermission(request, "integrations:manage");
  if (auth instanceof Response) return auth;
  try {
    const db = getDatabase();
    const tenantId = resolveStaffTenantId(db, auth);
    const body = asObject(await request.json());
    const provider = readNonEmptyString(body, "provider", 32);
    const secret = typeof body.secret === "string" && body.secret.trim() ? body.secret.trim() : null;
    const config = body.config && typeof body.config === "object" && !Array.isArray(body.config)
      ? body.config as Record<string, unknown>
      : {};
    const saved = saveTenantIntegration(db, tenantId, { provider, config, secret });
    new AuditLogRepository(db, tenantId).record({
      actorUserId: resolveStaffActorUserId(auth),
      action: "INTEGRATION_UPDATED",
      resourceType: "tenant_integration",
      resourceId: saved.id,
      metadata: { provider: saved.provider, hasSecret: Boolean(saved.credentialsEncrypted) },
    });
    return Response.json(
      { integrations: getPublicIntegrationStatus(db, tenantId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof TenantIntegrationError) {
      const status = error.code === "INTEGRATION_ENCRYPTION_MISSING" ? 503 : 400;
      return jsonError(status, error.code, error.message);
    }
    return jsonError(400, "INVALID_REQUEST", error instanceof Error ? error.message : "Invalid request.");
  }
}

export async function POST(request: Request) {
  const auth = requireStaffPermission(request, "integrations:manage");
  if (auth instanceof Response) return auth;
  const db = getDatabase();
  const tenantId = resolveStaffTenantId(db, auth);
  const contentType = request.headers.get("content-type") ?? "";
  let action = "test";
  let deliveryId: string | null = null;
  if (contentType.includes("application/json")) {
    try {
      const body = asObject(await request.json());
      if (typeof body.action === "string" && body.action.trim()) action = body.action.trim();
      if (typeof body.deliveryId === "string" && body.deliveryId.trim()) deliveryId = body.deliveryId.trim();
    } catch {
      return jsonError(400, "INVALID_REQUEST", "Request body must be a JSON object.");
    }
  }

  if (action === "retry-webhooks" || action === "retry-webhook") {
    const changed = new OutboundWebhookRepository(db, tenantId).requeueDead(deliveryId ?? undefined);
    if (action === "retry-webhook" && changed === 0) {
      return jsonError(404, "WEBHOOK_NOT_FOUND", "No dead webhook delivery matched that id.");
    }
    const drain = await drainOutboundWebhooks(db, { limit: 25 });
    return Response.json(
      { retried: changed, drain, integrations: getPublicIntegrationStatus(db, tenantId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (action === "retry-notifications") {
    const changed = new NotificationOutboxRepository(db, tenantId).requeueDead();
    const drain = await drainNotificationOutbox(db, { limit: 25 });
    return Response.json(
      { retried: changed, drain, integrations: getPublicIntegrationStatus(db, tenantId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const webhook = resolveWebhookCredentials(db, tenantId);
  if (!webhook.configured) {
    return jsonError(400, "WEBHOOK_NOT_CONFIGURED", "Save a webhook URL and secret before sending a test event.");
  }
  if (!webhook.events.includes("refund.completed")) {
    return jsonError(400, "WEBHOOK_EVENT_DISABLED", "Enable refund.completed to send a test event.");
  }
  enqueueOutboundWebhook(db, {
    eventType: "refund.completed",
    eventKey: `refund.completed:test:${randomUUID()}`,
    tenantId,
    payload: { test: true, source: "admin" },
  });
  const drain = await drainOutboundWebhooks(db, { limit: 10 });
  return Response.json(
    { drain, integrations: getPublicIntegrationStatus(db, tenantId) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
