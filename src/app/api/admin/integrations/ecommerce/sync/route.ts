import { randomUUID } from "node:crypto";
import { getDatabase } from "@/db/database";
import { parseBusinessContextSnapshot, syncBusinessContext } from "@/services/integrations/business-sync.service";
import { signIntegrationPayload } from "@/security/integration-signature";
import { hasStaffApiAccess } from "@/security/admin-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function integrationSecret() {
  const secret = process.env.BUSINESS_INTEGRATION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("BUSINESS_INTEGRATION_SECRET must be configured with at least 32 characters.");
  }
  return secret;
}

function ecommerceBaseUrl() {
  const baseUrl = process.env.ECOMMERCE_BASE_URL?.trim().replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("ECOMMERCE_BASE_URL must be configured to pull store data.");
  }
  return baseUrl;
}

export async function POST(request: Request) {
  if (!hasStaffApiAccess(request)) {
    return Response.json({ error: { code: "UNAUTHORIZED", message: "Staff authorization is required." } }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: { code: "INVALID_REQUEST", message: "Invalid request body." } }, { status: 400 });
  }

  const customerId = typeof body.customerId === "string" ? body.customerId.trim() : "";
  if (!customerId) {
    return Response.json({ error: { code: "INVALID_REQUEST", message: "customerId is required." } }, { status: 400 });
  }

  try {
    const rawBody = JSON.stringify({ customerId });
    const timestamp = String(Date.now());
    const eventId = `pull_${randomUUID()}`;
    const signature = signIntegrationPayload({
      secret: integrationSecret(),
      timestamp,
      eventId,
      rawBody,
    });

    const response = await fetch(`${ecommerceBaseUrl()}/api/integrations/jobform/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-jobform-timestamp": timestamp,
        "x-jobform-event-id": eventId,
        "x-jobform-signature": `sha256=${signature}`,
        "x-jobform-source": "jobform-admin",
      },
      body: rawBody,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`E-commerce export failed (${response.status}): ${text}`);
    }

    const snapshot = await response.json() as unknown;
    const parsed = parseBusinessContextSnapshot(snapshot);
    const result = syncBusinessContext(getDatabase(), {
      source: "ecommerce-admin-pull",
      eventId,
      rawBody,
      snapshot: parsed,
    });
    return Response.json({
      ok: true,
      customerId: result.customerId,
      syncedOrders: result.ordersUpserted,
      idempotentReplay: result.idempotentReplay,
    });
  } catch (error) {
    return Response.json(
      { error: { code: "ECOMMERCE_SYNC_FAILED", message: error instanceof Error ? error.message : "Unable to sync from e-commerce." } },
      { status: 400 },
    );
  }
}
