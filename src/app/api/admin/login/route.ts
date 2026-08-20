import { getDatabase } from "@/db/database";
import { asObject, clientAddress, jsonError, readNonEmptyString } from "@/lib/http";
import { consumeRateLimit, RateLimitExceededError } from "@/security/rate-limit";
import {
  AdminAuthenticationError,
  adminSessionCookie,
  clearAdminSessionCookie,
  createAdminSessionToken,
  readAdminSession,
} from "@/security/admin-session";
import { staffSessionPayload } from "@/security/staff-authorization";
import { authenticateStaffUser } from "@/services/auth/staff-auth.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = readAdminSession(request);
  if (!session) return jsonError(401, "ADMIN_ACCESS_DENIED", "Staff sign-in is required.");
  return Response.json(staffSessionPayload(session), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const db = getDatabase();
  try {
    consumeRateLimit(db, {
      key: `admin-login:${clientAddress(request)}`,
      limit: 8,
      windowMs: 10 * 60_000,
    });
    const body = asObject(await request.json());
    const email = readNonEmptyString(body, "email", 320);
    const password = readNonEmptyString(body, "password", 256);
    const staffUser = authenticateStaffUser(db, email, password);
    const token = createAdminSessionToken({
      userId: staffUser.id,
      email: staffUser.email,
      tenantId: staffUser.tenantId,
      role: staffUser.role,
    });
    return Response.json(staffSessionPayload({
      userId: staffUser.id,
      email: staffUser.email,
      tenantId: staffUser.tenantId,
      role: staffUser.role,
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    }), {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": adminSessionCookie(token),
      },
    });
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return Response.json(
        { error: { code: error.code, message: "Too many sign-in attempts. Please wait before trying again." } },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      );
    }
    if (error instanceof AdminAuthenticationError) {
      return jsonError(error.code === "ADMIN_SESSION_NOT_CONFIGURED" ? 503 : 401, error.code, error.message);
    }
    return jsonError(400, "INVALID_REQUEST", error instanceof Error ? error.message : "Invalid request.");
  }
}

export async function DELETE() {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Set-Cookie": clearAdminSessionCookie(),
    },
  });
}
