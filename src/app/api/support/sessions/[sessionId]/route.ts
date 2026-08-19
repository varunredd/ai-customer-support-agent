import { getDatabase } from "@/db/database";
import { jsonError } from "@/lib/http";
import { assertSupportSessionAccess, SupportAccessError } from "@/security/support-access";
import {
  getSupportSessionDetail,
  InvalidSupportContextError,
  SupportSessionNotFoundError,
} from "@/services/support/support-session.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const db = getDatabase();
  try {
    assertSupportSessionAccess(db, sessionId, request);
    return Response.json(await getSupportSessionDetail(db, sessionId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SupportAccessError) return jsonError(error.code === "SUPPORT_SESSION_NOT_FOUND" ? 404 : 401, error.code, error.message);
    if (error instanceof SupportSessionNotFoundError) return jsonError(404, error.code, error.message);
    if (error instanceof InvalidSupportContextError) return jsonError(500, error.code, error.message);
    return jsonError(500, "SESSION_READ_FAILED", "Unable to load support session.");
  }
}
