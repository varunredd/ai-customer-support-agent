import { getDatabase } from "@/db/database";
import { operationalLog } from "@/lib/observability/system-logger";
import { IntegrationAuthenticationError, verifyIntegrationRequest } from "@/security/integration-signature";
import { BusinessSyncValidationError, parseBusinessContextSnapshot, syncBusinessContext } from "@/services/integrations/business-sync.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const db = getDatabase();
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 512_000) {
    return Response.json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Integration payload exceeds 512 KB." } }, { status: 413 });
  }

  let eventId: string | null = null;
  try {
    const verified = verifyIntegrationRequest({
      secret: process.env.BUSINESS_INTEGRATION_SECRET,
      timestamp: request.headers.get("x-jobform-timestamp"),
      eventId: request.headers.get("x-jobform-event-id"),
      signature: request.headers.get("x-jobform-signature"),
      rawBody,
    });
    eventId = verified.eventId;
    const snapshot = parseBusinessContextSnapshot(JSON.parse(rawBody));
    const result = syncBusinessContext(db, {
      source: request.headers.get("x-jobform-source")?.slice(0, 80) || "business-platform",
      eventId: verified.eventId,
      rawBody,
      snapshot,
    });
    operationalLog({
      severity: "INFO",
      source: "business-integration",
      code: result.idempotentReplay ? "BUSINESS_CONTEXT_REPLAYED" : "BUSINESS_CONTEXT_SYNCED",
      message: result.idempotentReplay ? "Business context sync replay accepted idempotently." : "Business context synchronized.",
      metadata: { eventId: verified.eventId, customerId: result.customerId, ordersUpserted: result.ordersUpserted },
    }, db);
    return Response.json(result, { status: result.idempotentReplay ? 200 : 202 });
  } catch (error) {
    const auth = error instanceof IntegrationAuthenticationError;
    const validation = error instanceof BusinessSyncValidationError || error instanceof SyntaxError;
    operationalLog({
      severity: auth ? "WARN" : "ERROR",
      source: "business-integration",
      code: auth ? "INTEGRATION_AUTHENTICATION_FAILED" : validation ? "BUSINESS_SYNC_VALIDATION_FAILED" : "BUSINESS_SYNC_FAILED",
      message: auth ? "Rejected unauthenticated business integration request." : validation ? "Rejected invalid business integration payload." : "Business context synchronization failed.",
      metadata: { eventId },
    }, db);
    return Response.json({
      error: {
        code: auth ? "INTEGRATION_AUTHENTICATION_FAILED" : validation ? "BUSINESS_SYNC_VALIDATION_FAILED" : "BUSINESS_SYNC_FAILED",
        message: auth ? "Integration authentication failed." : validation ? (error instanceof Error ? error.message : "Invalid integration payload.") : "Unable to synchronize business context.",
      },
    }, { status: auth ? 401 : validation ? 400 : 500 });
  }
}
