import { getDatabase } from "@/db/database";
import { publicAppBaseUrl } from "@/lib/app-url";
import { operationalLog } from "@/lib/observability/system-logger";
import { IntegrationAuthenticationError, verifyIntegrationRequest } from "@/security/integration-signature";
import { createIntegratedSupportLaunch, SupportLaunchContextError } from "@/services/integrations/support-launch.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stringField(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 128) {
    throw new SupportLaunchContextError(`${name} must be a non-empty string up to 128 characters.`);
  }
  return value.trim();
}

export async function POST(request: Request) {
  const db = getDatabase();
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 8_192) {
    return Response.json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Support launch payload exceeds 8 KB." } }, { status: 413 });
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
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    const customerId = stringField(parsed.customerId, "customerId");
    const orderId = stringField(parsed.orderId, "orderId");
    const baseUrl = publicAppBaseUrl();
    if (!baseUrl) throw new Error("APP_BASE_URL is not configured.");

    const launch = await createIntegratedSupportLaunch(db, {
      customerId,
      orderId,
      integrationEventId: verified.eventId,
      baseUrl,
    });
    operationalLog({
      severity: "INFO",
      source: "support-launch-integration",
      code: "SUPPORT_LAUNCH_ISSUED",
      message: "Issued a short-lived host support launch.",
      metadata: { eventId: verified.eventId, customerId, orderId },
    }, db);
    return Response.json(launch, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const auth = error instanceof IntegrationAuthenticationError;
    const invalidContext = error instanceof SupportLaunchContextError || error instanceof SyntaxError;
    operationalLog({
      severity: auth ? "WARN" : "ERROR",
      source: "support-launch-integration",
      code: auth ? "INTEGRATION_AUTHENTICATION_FAILED" : invalidContext ? "SUPPORT_LAUNCH_CONTEXT_REJECTED" : "SUPPORT_LAUNCH_FAILED",
      message: auth ? "Rejected unauthenticated support-launch request." : invalidContext ? "Rejected invalid support-launch context." : "Unable to issue support launch.",
      metadata: { eventId },
    }, db);
    return Response.json({
      error: {
        code: auth ? "INTEGRATION_AUTHENTICATION_FAILED" : invalidContext ? "INVALID_SUPPORT_LAUNCH_CONTEXT" : "SUPPORT_LAUNCH_FAILED",
        message: auth ? "Integration authentication failed." : invalidContext ? (error instanceof Error ? error.message : "Invalid support launch context.") : "Unable to issue support launch.",
      },
    }, { status: auth ? 401 : invalidContext ? 400 : 500 });
  }
}
