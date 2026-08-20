import { getDatabase } from "@/db/database";
import { asObject, clientAddress, jsonError, readNonEmptyString } from "@/lib/http";
import { consumeRateLimit, RateLimitExceededError } from "@/security/rate-limit";
import { portalEntryEnabled } from "@/security/support-access";
import { listPortalOrdersByEmail } from "@/services/support/support-context.service";
import { InvalidSupportContextError } from "@/services/support/support-session.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!portalEntryEnabled()) {
    return jsonError(403, "PORTAL_ENTRY_DISABLED", "Support must be opened from the store account.");
  }

  const db = getDatabase();
  try {
    const body = asObject(await request.json());
    const email = readNonEmptyString(body, "email", 320);
    consumeRateLimit(db, {
      key: `support-portal-lookup:${clientAddress(request)}:${email.toLowerCase()}`,
      limit: 8,
      windowMs: 10 * 60_000,
    });
    const lookup = await listPortalOrdersByEmail(db, email);
    return Response.json(lookup, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return Response.json(
        { error: { code: error.code, message: "Too many support lookups. Please wait before trying again." } },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      );
    }
    if (error instanceof InvalidSupportContextError) {
      return jsonError(404, error.code, error.message);
    }
    const message = error instanceof Error ? error.message : "Invalid request.";
    return jsonError(400, "INVALID_REQUEST", message);
  }
}
