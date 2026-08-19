import { getDatabase } from "@/db/database";
import { asObject, clientAddress, jsonError, readNonEmptyString } from "@/lib/http";
import { consumeRateLimit, RateLimitExceededError } from "@/security/rate-limit";
import {
  SupportAccessError,
  hostEntryEnabled,
  portalEntryEnabled,
  verifySupportLaunchToken,
} from "@/security/support-access";
import {
  createHostedSupportSession,
  createPortalSupportSession,
  InvalidSupportContextError,
} from "@/services/support/support-session.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorizedSession(detail: { session: unknown; customer: unknown; order: unknown; messages: unknown }, accessToken: string) {
  return Response.json({ ...detail, accessToken }, {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const db = getDatabase();
  try {
    const body = asObject(await request.json());
    if (typeof body.launchToken === "string" && body.launchToken.trim()) {
      if (!hostEntryEnabled()) {
        return jsonError(403, "HOST_ENTRY_DISABLED", "Store-launched support is not enabled.");
      }
      const launchToken = readNonEmptyString(body, "launchToken", 4096);
      const claims = verifySupportLaunchToken(launchToken);
      const created = await createHostedSupportSession(db, claims);
      return authorizedSession(created.detail, created.accessToken);
    }

    if (!portalEntryEnabled()) {
      return jsonError(403, "PORTAL_ENTRY_DISABLED", "Support must be opened from the store account.");
    }

    const email = readNonEmptyString(body, "email", 320);
    const orderId = readNonEmptyString(body, "orderId", 128);
    consumeRateLimit(db, {
      key: `support-portal:${clientAddress(request)}:${email.toLowerCase()}`,
      limit: 8,
      windowMs: 10 * 60_000,
    });
    const created = await createPortalSupportSession(db, { email, orderId });
    return authorizedSession(created.detail, created.accessToken);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return Response.json(
        { error: { code: error.code, message: "Too many support lookups. Please wait before trying again." } },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      );
    }
    if (error instanceof SupportAccessError) {
      return jsonError(error.code === "SUPPORT_LAUNCH_NOT_CONFIGURED" ? 503 : 401, error.code, error.message);
    }
    if (error instanceof InvalidSupportContextError) {
      return jsonError(404, error.code, error.message);
    }
    const message = error instanceof Error ? error.message : "Invalid request.";
    return jsonError(400, "INVALID_REQUEST", message);
  }
}
